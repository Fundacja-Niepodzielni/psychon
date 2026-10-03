<?php

namespace App\Services\H18;

use App\Exceptions\ApiException;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Jedno miejsce reguł zarządzania kontami w panelu administracji (H18, H04).
 *
 * Wołane z `authorize()` żądań, czyli PRZED walidacją ciała: konto
 * nieistniejące daje zawsze to samo `404 not_found`, a odmowa roli zawsze to
 * samo `403 forbidden` — niezależnie od tego, czy ciało przeszłoby walidację.
 * Kontroler powtarza sprawdzenie na wierszu zablokowanym w transakcji.
 *
 * Reguła „ostatniego aktywnego konta administracji” obejmuje blokadę,
 * odebranie roli administracyjnej i anonimizację: po żadnej z nich pula
 * aktywnych kont administracji (Opiekun Projektu i Super Admin razem) nie
 * może zostać pusta. Do puli liczą się wyłącznie konta z powiązaną tożsamością
 * Kont Niepodzielni (`users.keycloak_sub`, ustawiane przy pierwszym logowaniu):
 * konto, które nigdy się nie zalogowało, nie utrzyma panelu przy życiu.
 * Tak samo rola Super Admina: nikt nie odbiera jej ostatniemu powiązanemu
 * kontu Super Admina, także sobie samemu.
 *
 * Rolę osoby wywołującej czyta wyłącznie z tokenu (`TokenRoles`). `users.role` celu
 * jest lokalną, opisową kopią roli cudzego konta — ekrany i raporty ją czytają,
 * dlatego zapis roli administracyjnej też podlega tym regułom.
 */
final class AccountManagementGuard
{
    /** Role administracji — nadaje je i zmienia wyłącznie Super Admin. */
    public const ADMIN_ROLES = ['project_manager', 'super_admin'];

    public const SUPER_ADMIN_ACCOUNTS_MESSAGE = 'Tylko Super Admin może zarządzać kontami Super Admina.';

    public const ADMIN_ROLES_MESSAGE = 'Role administracyjne nadaje i zmienia wyłącznie Super Admin.';

    public function __construct(private readonly TokenRoles $tokenRoles) {}

    /**
     * Konto wskazane identyfikatorem z trasy albo identyczne 404.
     */
    public function target(mixed $id): User
    {
        $user = is_numeric($id) ? User::query()->find((int) $id) : null;

        if ($user === null) {
            throw self::notFound();
        }

        return $user;
    }

    public static function notFound(): ApiException
    {
        return new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
    }

    public function actorIsSuperAdmin(): bool
    {
        return $this->tokenRoles->has('super_admin');
    }

    /**
     * Konto Super Admina jest poza zasięgiem Opiekuna Projektu.
     */
    public function assertMayManage(User $target): void
    {
        if ($this->actorIsSuperAdmin()) {
            return;
        }

        if ($target->role === 'super_admin') {
            throw self::forbidden(self::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }
    }

    /**
     * Nowe konto z rolą administracyjną zakłada wyłącznie Super Admin.
     * Wartość czytana przed walidacją, więc porównanie jest ścisłe na napisie.
     */
    public function assertMayCreateWithRole(mixed $requestedRole): void
    {
        if ($this->actorIsSuperAdmin()) {
            return;
        }

        if ($requestedRole === 'super_admin') {
            throw self::forbidden(self::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }

        if (is_string($requestedRole) && in_array($requestedRole, self::ADMIN_ROLES, true)) {
            throw self::forbidden(self::ADMIN_ROLES_MESSAGE);
        }
    }

    /**
     * Zmiana roli istniejącego konta. Ta sama wartość co zapisana nie jest
     * zmianą (formularz karty odsyła rolę razem z resztą pól). Opiekun Projektu
     * nie nadaje roli administracyjnej i nie zmienia roli konta, które ją ma.
     */
    public function assertMayChangeRole(User $target, mixed $requestedRole): void
    {
        $this->assertMayManage($target);

        if ($this->actorIsSuperAdmin() || $requestedRole === null || $requestedRole === $target->role) {
            return;
        }

        if ($requestedRole === 'super_admin') {
            throw self::forbidden(self::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }

        $requestedIsAdmin = is_string($requestedRole) && in_array($requestedRole, self::ADMIN_ROLES, true);

        if ($requestedIsAdmin || in_array($target->role, self::ADMIN_ROLES, true)) {
            throw self::forbidden(self::ADMIN_ROLES_MESSAGE);
        }
    }

    /**
     * Zmiana roli zabiera kontu rolę administracyjną (ta sama wartość albo
     * przejście między rolami administracji nie zabiera). Wartość czytana
     * przed walidacją: wszystko spoza ról administracji liczy się jako odebranie.
     */
    public static function removesAdministrativeRole(User $target, mixed $requestedRole): bool
    {
        if ($requestedRole === null || $requestedRole === $target->role) {
            return false;
        }

        return in_array($target->role, self::ADMIN_ROLES, true)
            && ! (is_string($requestedRole) && in_array($requestedRole, self::ADMIN_ROLES, true));
    }

    /**
     * Konta administracji, które dziś mogą się zalogować: lokalna rola
     * administracyjna, stan `active`, bez anonimizacji i z powiązaną
     * tożsamością (ktoś zalogował się co najmniej raz).
     *
     * @return Builder<User>
     */
    public static function activeAdministrators(): Builder
    {
        return User::query()
            ->whereIn('role', self::ADMIN_ROLES)
            ->where('status', 'active')
            ->whereNull('anonymized_at')
            ->whereNotNull('keycloak_sub')
            ->where('keycloak_sub', '!=', '');
    }

    /**
     * Pula aktywnych kont administracji: identyfikator => lokalna rola. Z blokadą
     * wiersze są blokowane zawsze w tej samej kolejności i PRZED wierszem celu —
     * dwie równoległe operacje nie zostawią puli pustej i nie zakleszczą się.
     *
     * @return Collection<int, string>
     */
    public static function activeAdministratorPool(bool $lock = false): Collection
    {
        $query = self::activeAdministrators()->orderBy('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->pluck('role', 'id');
    }

    /**
     * Operacja zabiera `$target` z puli aktywnej administracji — odmowa, gdy
     * jest jej ostatnim kontem. Bez puli czyta ją bez blokady (sprawdzenie przed
     * walidacją); kontroler powtarza je na zablokowanych wierszach.
     *
     * @param  Collection<int, string>|null  $pool
     */
    public static function assertNotLastActiveAdministrator(User $target, ?Collection $pool = null): void
    {
        $pool ??= self::activeAdministratorPool();

        if ($pool->has($target->id) && $pool->count() <= 1) {
            throw self::lastActiveAdministrator();
        }
    }

    /**
     * Zmiana roli zabiera kontu rolę Super Admina (także na Opiekuna Projektu —
     * wtedy nie zostaje nikt, kto nadaje role administracyjne). Wartość czytana
     * przed walidacją: wszystko poza `super_admin` liczy się jako odebranie.
     */
    public static function removesSuperAdminRole(User $target, mixed $requestedRole): bool
    {
        return $target->role === 'super_admin'
            && $requestedRole !== null
            && $requestedRole !== 'super_admin';
    }

    /**
     * Odebranie roli Super Admina ostatniemu powiązanemu aktywnemu kontu
     * Super Admina — odmowa, nawet gdy w puli administracji zostaje Opiekun.
     *
     * @param  Collection<int, string>|null  $pool
     */
    public static function assertNotLastActiveSuperAdmin(User $target, ?Collection $pool = null): void
    {
        $pool ??= self::activeAdministratorPool();

        if ($pool->get($target->id) === 'super_admin' && $pool->filter(fn (string $role): bool => $role === 'super_admin')->count() <= 1) {
            throw self::lastActiveAdministrator();
        }
    }

    public static function lastActiveAdministrator(): ApiException
    {
        return new ApiException(
            409,
            'last_active_administrator',
            'To ostatnie aktywne konto administracji. Najpierw nadaj tę rolę innej osobie.',
        );
    }

    public static function assertNotOwnAccount(User $target, ?User $actor, ApiException $refusal): void
    {
        if ($actor !== null && $target->id === $actor->id) {
            throw $refusal;
        }
    }

    public static function cannotBlockSelf(): ApiException
    {
        return new ApiException(422, 'cannot_block_self', 'Nie można zablokować własnego konta.');
    }

    public static function cannotAnonymizeSelf(): ApiException
    {
        return new ApiException(
            422,
            'cannot_anonymize_self',
            'Nie można uruchomić procedury anonimizacji na własnym koncie.',
        );
    }

    /**
     * Konto czeka na pierwsze powiązanie z Kontami Niepodzielni przez
     * odnośnik z zaproszenia.
     */
    public static function hasPendingInvitation(User $user): bool
    {
        return ($user->keycloak_sub === null || $user->keycloak_sub === '')
            && $user->activation_token !== null
            && $user->anonymized_at === null;
    }

    private static function forbidden(string $message): ApiException
    {
        return new ApiException(403, 'forbidden', $message);
    }
}
