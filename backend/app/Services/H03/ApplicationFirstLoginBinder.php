<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\User;
use App\Services\Keycloak\KeycloakPrincipal;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Jedna reguła wiązania `sub` z kontem lokalnym, wspólna dla pierwszego
 * logowania z przyjętego zgłoszenia (`POST /applications/first-login`)
 * i dla odnośnika z zaproszenia (`POST /sso/powiaz`).
 *
 * Wiązanie następuje wyłącznie przy trzech warunkach naraz:
 *  1. `iss` tokena równy wystawcy z konfiguracji (sprawdza już middleware
 *     `auth.keycloak`; tu powtórzone, bo od tego zależy zaufanie do adresu),
 *  2. `email_verified === true`, inaczej 403 `email_not_verified`,
 *  3. adres z tokena po normalizacji równy adresowi zaproszenia, inaczej 404
 *     `invitation_not_found` (bez ujawniania, na jaki adres jest zaproszenie).
 * Po powiązaniu konto ma `status = active`.
 *
 * Podpis, odbiorcę i ważność tokena sprawdził middleware na tym samym
 * nagłówku, więc tutaj odczytujemy tylko treść już zweryfikowanego tokena.
 * Odmowy nie niosą żadnej wartości z tokena (ani adresu, ani `sub`).
 */
final class ApplicationFirstLoginBinder
{
    /**
     * Pierwsze logowanie: zaproszenie wskazuje przyjęte zgłoszenie o adresie z tokena.
     */
    public static function bind(KeycloakPrincipal $principal, string $bearerToken): User
    {
        $email = self::verifiedEmail($bearerToken);

        return DB::transaction(function () use ($principal, $email): User {
            $application = $email === null ? null : Application::query()
                ->status('accepted')
                ->whereNotNull('user_id')
                ->whereRaw('LOWER(email) = ?', [$email])
                ->orderByDesc('decided_at')
                ->first();

            if ($application === null) {
                throw self::invitationNotFound();
            }

            $user = User::query()->whereKey($application->user_id)->lockForUpdate()->first();

            return self::attach($principal, $user);
        });
    }

    /**
     * Odnośnik z zaproszenia: konto wskazuje jednorazowy token zaproszenia,
     * a adres z tokena Kont musi być adresem tego konta. Token zaproszenia
     * jest zużywany przy powodzeniu.
     */
    public static function bindByInvitationToken(KeycloakPrincipal $principal, string $bearerToken, string $invitationToken): User
    {
        $email = self::verifiedEmail($bearerToken);

        return DB::transaction(function () use ($principal, $email, $invitationToken): User {
            $user = User::query()->where('activation_token', $invitationToken)->lockForUpdate()->first();

            if ($user === null) {
                throw new ApiException(
                    422,
                    'invalid_token',
                    'Nieprawidłowy lub wykorzystany token zaproszenia.',
                );
            }

            if ($email === null || ApplicationEmailNormalizer::normalize((string) $user->email) !== $email) {
                throw self::invitationNotFound();
            }

            return self::attach($principal, $user);
        });
    }

    /**
     * Warunki 1 i 2; zwraca znormalizowany adres z tokena albo null, gdy go brak.
     */
    private static function verifiedEmail(string $bearerToken): ?string
    {
        $claims = self::claims($bearerToken);

        if (! isset($claims->iss) || $claims->iss !== (string) config('keycloak.issuer')) {
            throw new ApiException(401, 'invalid_token', 'Token dostępu jest nieprawidłowy lub wygasł.');
        }

        if (($claims->email_verified ?? null) !== true) {
            throw new ApiException(
                403,
                'email_not_verified',
                'Adres e-mail w Kontach Niepodzielni nie jest jeszcze potwierdzony. Potwierdź go linkiem z wiadomości i zaloguj się ponownie.',
            );
        }

        return is_string($claims->email ?? null) && trim($claims->email) !== ''
            ? ApplicationEmailNormalizer::normalize($claims->email)
            : null;
    }

    /**
     * Wspólny koniec obu dróg; wołany wewnątrz transakcji z zablokowanym kontem.
     */
    private static function attach(KeycloakPrincipal $principal, ?User $user): User
    {
        if ($user === null || $user->anonymized_at !== null || in_array($user->status, ['blocked', 'deleted'], true)) {
            throw new ApiException(403, 'forbidden', 'To konto nie jest aktywne. Skontaktuj się z opiekunem projektu.');
        }

        if ($user->keycloak_sub !== null && $user->keycloak_sub !== $principal->sub) {
            throw new ApiException(
                409,
                'already_bound',
                'To konto jest już połączone z innym kontem Niepodzielni.',
            );
        }

        $subTakenByAnotherUser = User::query()
            ->where('keycloak_sub', $principal->sub)
            ->where('id', '!=', $user->id)
            ->exists();

        if ($subTakenByAnotherUser) {
            throw new ApiException(
                409,
                'sub_already_bound',
                'To konto Niepodzielni jest już połączone z innym użytkownikiem.',
            );
        }

        if ($user->keycloak_sub === $principal->sub && $user->status === 'active' && $user->activation_token === null) {
            return $user;
        }

        $user->forceFill([
            'keycloak_sub' => $principal->sub,
            'status' => 'active',
            'activation_token' => null,
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        return $user;
    }

    private static function invitationNotFound(): ApiException
    {
        return new ApiException(
            404,
            'invitation_not_found',
            'Nie znaleziono zaproszenia dla adresu e-mail z tego konta Niepodzielni. Zaloguj się kontem założonym na adres, na który przyszło zaproszenie.',
        );
    }

    private static function claims(string $bearerToken): object
    {
        $parts = explode('.', $bearerToken);

        try {
            $claims = JWT::jsonDecode(JWT::urlsafeB64Decode($parts[1] ?? ''));
        } catch (Throwable) {
            $claims = null;
        }

        if (! is_object($claims)) {
            throw new ApiException(401, 'invalid_token', 'Token dostępu jest nieprawidłowy lub wygasł.');
        }

        return $claims;
    }
}
