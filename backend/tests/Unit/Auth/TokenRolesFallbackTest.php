<?php

namespace Tests\Unit\Auth;

use App\Models\User;
use App\Services\Auth\TokenRoles;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * F-111 · zieleń suity nie jest sama w sobie dowodem R2 („role wyłącznie
 * z tokena"): 373 wywołań `actingAs($user, 'keycloak')` w 63 plikach
 * przechodzą przez furtkę testową (`TokenRoles::TESTING_FALLBACK_ROLES`),
 * a nie przez prawdziwy token. Świadek tutaj NIE mierzy tamte 373 miejsca —
 * mierzy DWA warunki, od których zależy, czy ta furtka w ogóle jest
 * furtką, a nie tylnymi drzwiami:
 *
 *   1. jest INERTNA poza `APP_ENV=testing` (a nie tylko „domyślnie" —
 *      mutacja, która zdejmuje warunek środowiska, ma to złamać);
 *   2. niesie rolę ZAMROŻONĄ w chwili `actingAs()`, a nie odczytaną NA
 *      ŻYWO z `users.role` przy każdym wywołaniu `current()` — bo furtka,
 *      która czyta kolumnę na żywo, jest dokładnie tym, czego R2 zakazuje,
 *      tylko o jedno pole dalej.
 *
 * Bez cechy bazodanowej (żaden test nie dotyka bazy) — `wspolna-baza`,
 * jak każda klasa dziedzicząca po `Tests\TestCase` bez takiej cechy
 * (`tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`).
 */
#[Group('wspolna-baza')]
class TokenRolesFallbackTest extends TestCase
{
    /**
     * Mutacja K7(a): usunięcie `app()->environment('testing') &&` w
     * `TokenRoles::current()` sprawia, że furtka odpowiada w KAŻDYM
     * środowisku — ten test wtedy zczerwienieje (`current()` przestaje
     * zwracać `[]`).
     */
    public function test_the_fallback_is_inert_outside_the_testing_environment(): void
    {
        $this->app['env'] = 'production';
        $this->app->instance(TokenRoles::TESTING_FALLBACK_ROLES, ['super_admin']);

        $this->assertSame([], app(TokenRoles::class)->current());
    }

    /**
     * Kontrola pozytywna do powyższej: w środowisku `testing` (to, w którym
     * suita naprawdę biegnie) ta sama furtka odpowiada normalnie.
     */
    public function test_the_fallback_answers_normally_inside_testing(): void
    {
        $this->app['env'] = 'testing';
        $this->app->instance(TokenRoles::TESTING_FALLBACK_ROLES, ['super_admin']);

        $this->assertSame(['super_admin'], app(TokenRoles::class)->current());
    }

    /**
     * Mutacja K7(b): furtka podstawiona rolą CZYTANĄ Z KOLUMNY na żywo
     * (zamiast zamrożonej tablicy z chwili `actingAs()`) sprawia, że
     * zmiana `users.role` PO uwierzytelnieniu zmienia to, co widzi
     * `current()` — dokładnie ten sam błąd, który R2 zakazuje na trasie
     * biznesowej, tylko przeniesiony do samej furtki. `TestCase::actingAs()`
     * wiąże `[$user->role]` JEDNORAZOWO w chwili wywołania; ten test
     * dowodzi, że późniejsza zmiana kolumny nie ma już żadnego wpływu.
     */
    public function test_the_bound_fallback_role_is_frozen_at_acting_as_time_not_read_live_from_the_column(): void
    {
        $user = User::factory()->make(['role' => 'super_admin']);
        // Bez zapisu do bazy - ta klasa jest `wspolna-baza` bez cechy DB;
        // wiążemy furtkę dokładnie tak, jak robi to `Tests\TestCase::actingAs()`.
        $this->app->instance(TokenRoles::TESTING_FALLBACK_ROLES, [$user->role]);

        // Zmiana „kolumny" PO związaniu furtki - furtka zamrożona nie ma jak tego zobaczyć.
        $user->role = 'volunteer';

        $this->assertSame(['super_admin'], app(TokenRoles::class)->current());
    }
}
