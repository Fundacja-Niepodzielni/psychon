<?php

namespace Tests\Feature\AccessExpiry;

use App\Models\AccessDateChange;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H04 · zakres daty w `POST /admin/users/{id}/extend-access` i zasada zarządzania kontami.
 *
 * Czas stoi. Data końca dostępu jest późniejsza niż dzisiejszy dzień i najdalej o 24 miesiące
 * od dziś (ten dzień włącznie); dni liczą się w kalendarzu polskim (Europe/Warsaw), nie w UTC.
 * Datę ma tylko osoba w programie (wolontariusz, student) — konta prowadzących i administracji
 * nie mają terminu. Konto Super Admina zmienia tylko Super Admin, a własnej daty nie zmienia
 * nikt — tak samo jak przy blokadzie konta. Przy każdej odmowie data w bazie zostaje, a dziennik
 * i rekordy zmian daty się nie powiększają.
 *
 * `php artisan test --filter=ExtendAccessBoundsTest`
 */
class ExtendAccessBoundsTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    /** 14:00 w Warszawie (CEST) — ten sam dzień kalendarzowy w UTC i w Polsce. */
    private const NOW = '2026-10-03 12:00:00';

    private const OLD_EXPIRY = '2027-01-15 00:00:00';

    private const REASON = 'Przedłużenie uzgodnione na spotkaniu zespołu.';

    private const NOT_AFTER_TODAY = 'Data końca dostępu musi być późniejsza niż dzisiejsza.';

    private const TOO_FAR = 'Nowa data dostępu może być najwyżej 24 miesiące od dziś.';

    private const NOT_APPLICABLE = 'Konta prowadzących i administracji nie mają terminu dostępu. Takie konto wyłącza się blokadą.';

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);
        $this->travelTo(Carbon::parse(self::NOW));
    }

    private function extend(User $actor, User $target, array $body)
    {
        return $this->withTokenOf($actor)
            ->postJson("/api/v1/admin/users/{$target->id}/extend-access", $body + ['reason' => self::REASON]);
    }

    private function account(string $role): User
    {
        return $this->boundAccount($role, ['access_expires_at' => Carbon::parse(self::OLD_EXPIRY)]);
    }

    private function volunteer(): User
    {
        return $this->account('volunteer');
    }

    private function assertNothingChanged(User $target): void
    {
        $this->assertTrue(
            $target->fresh()->access_expires_at->equalTo(Carbon::parse(self::OLD_EXPIRY)),
            'data dostępu zmieniona mimo odmowy',
        );
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->count(), 'wpis access.extended mimo odmowy');
        $this->assertSame(0, AccessDateChange::query()->count(), 'rekord zmiany daty mimo odmowy');
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function datesNotAfterToday(): array
    {
        return [
            'dawna data' => ['2000-01-01'],
            'wczoraj' => ['2026-10-02'],
            'wczoraj, koniec dnia' => ['2026-10-02T23:59:59Z'],
            'dziś' => ['2026-10-03'],
            'dziś o północy' => ['2026-10-03T00:00:00Z'],
            'dziś, ostatnia minuta dnia w Polsce' => ['2026-10-03T21:59:00Z'],
        ];
    }

    #[DataProvider('datesNotAfterToday')]
    public function test_a_date_that_is_not_after_today_is_refused_on_until(string $until): void
    {
        $pm = $this->boundAccount('project_manager');
        $target = $this->volunteer();

        $this->extend($pm, $target, ['until' => $until])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.until.0', self::NOT_AFTER_TODAY);

        $this->assertNothingChanged($target);
    }

    public function test_the_lower_limit_follows_the_clock_not_a_fixed_day(): void
    {
        $this->travelTo(Carbon::parse('2027-03-10 18:30:00'));
        $pm = $this->boundAccount('project_manager');
        $target = $this->volunteer();

        foreach (['2027-03-10', '2027-03-10T22:59:59Z', '2027-03-09'] as $until) {
            $this->extend($pm, $target, ['until' => $until])
                ->assertStatus(422)
                ->assertJsonPath('error.errors.until.0', self::NOT_AFTER_TODAY);
        }

        $this->assertNothingChanged($target);

        $this->extend($pm, $target, ['until' => '2027-03-11'])->assertOk();
        $this->assertSame('2027-03-11', $target->fresh()->access_expires_at->toDateString());
    }

    public function test_tomorrow_is_accepted(): void
    {
        $pm = $this->boundAccount('project_manager');
        $target = $this->volunteer();

        $this->extend($pm, $target, ['until' => '2026-10-04'])->assertOk();

        $this->assertSame('2026-10-04', $target->fresh()->access_expires_at->toDateString());
        $this->assertSame(1, AccessDateChange::query()->count());
        $this->assertSame(1, AuditLogEntry::query()->where('action', 'access.extended')->count());
    }

    public function test_exactly_twenty_four_months_from_today_is_accepted_to_the_end_of_that_day(): void
    {
        $pm = $this->boundAccount('project_manager');

        foreach (['2028-10-03', '2028-10-03T00:00:00Z', '2028-10-03T21:59:59Z'] as $until) {
            $target = $this->volunteer();

            $this->extend($pm, $target, ['until' => $until])->assertOk();

            $this->assertSame('2028-10-03', $target->fresh()->access_expires_at->toDateString(), $until);
        }
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function datesBeyondTwentyFourMonths(): array
    {
        return [
            'dzień po granicy' => ['2028-10-04'],
            'dzień po granicy, północ UTC' => ['2028-10-04T00:00:00Z'],
            'pierwsza chwila następnego dnia w Polsce' => ['2028-10-03T22:00:00Z'],
            'dużo dalej' => ['2099-01-01'],
        ];
    }

    #[DataProvider('datesBeyondTwentyFourMonths')]
    public function test_a_date_beyond_twenty_four_months_is_refused_on_until(string $until): void
    {
        $pm = $this->boundAccount('project_manager');
        $target = $this->volunteer();

        $this->extend($pm, $target, ['until' => $until])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.until.0', self::TOO_FAR);

        $this->assertNothingChanged($target);
    }

    /**
     * Chwila w UTC (po 22:00 latem, po 23:00 zimą) to w Polsce już następny dzień:
     * „jutro według UTC” jest w Polsce dzisiaj, a granica górna przesuwa się o dzień.
     *
     * @return array<string, array{0: string, 1: string, 2: string, 3: string, 4: string}>
     */
    public static function polishCalendarDays(): array
    {
        return [
            'lato, 23:30 UTC = 01:30 w Polsce' => ['2026-10-03 23:30:00', '2026-10-04', '2026-10-05', '2028-10-04', '2028-10-05'],
            'zima, 23:30 UTC = 00:30 w Polsce' => ['2027-01-15 23:30:00', '2027-01-16', '2027-01-17', '2029-01-16', '2029-01-17'],
        ];
    }

    #[DataProvider('polishCalendarDays')]
    public function test_days_are_counted_in_the_polish_calendar_not_in_utc(string $now, string $polishToday, string $firstAllowed, string $lastAllowed, string $firstRefused): void
    {
        $this->travelTo(Carbon::parse($now));
        $pm = $this->boundAccount('project_manager');
        $target = $this->volunteer();

        // Polskie „dziś” jest odrzucone, choć w UTC to jeszcze jutro.
        $this->extend($pm, $target, ['until' => $polishToday])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.until.0', self::NOT_AFTER_TODAY);

        $this->extend($pm, $target, ['until' => $firstRefused])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.until.0', self::TOO_FAR);

        $this->assertNothingChanged($target);

        $this->extend($pm, $target, ['until' => $firstAllowed])->assertOk();
        $this->assertSame($firstAllowed, $target->fresh()->access_expires_at->toDateString());

        $other = $this->volunteer();
        $this->extend($pm, $other, ['until' => $lastAllowed])->assertOk();
        $this->assertSame($lastAllowed, $other->fresh()->access_expires_at->toDateString());
    }

    public function test_months_may_reach_the_last_polish_day_of_the_limit(): void
    {
        // Polskie „dziś” to 2026-10-04; granica górna 2028-10-04 do końca dnia (21:59:59 UTC).
        $this->travelTo(Carbon::parse('2026-10-03 23:30:00'));
        $pm = $this->boundAccount('project_manager');
        $target = $this->boundAccount('volunteer', ['access_expires_at' => Carbon::parse('2028-04-04 00:00:00')]);

        $this->extend($pm, $target, ['months' => 6])->assertOk();

        $this->assertSame('2028-10-04', $target->fresh()->access_expires_at->toDateString());
    }

    /**
     * @return array<string, array{0: string|null, 1: int, 2: string}>
     */
    public static function monthsThatWouldOverflow(): array
    {
        return [
            'od dziś, 29 lutego + 24 miesiące' => ['2028-01-01 00:00:00', 24, '2030-02-28'],
            'na przyszłą datę, 31 sierpnia + 6 miesięcy' => ['2029-08-31 00:00:00', 6, '2030-02-28'],
        ];
    }

    #[DataProvider('monthsThatWouldOverflow')]
    public function test_months_never_spill_into_the_next_month_past_the_limit(string $expiry, int $months, string $expected): void
    {
        $this->travelTo(Carbon::parse('2028-02-29 12:00:00'));
        $pm = $this->boundAccount('project_manager');
        $target = $this->boundAccount('volunteer', ['access_expires_at' => Carbon::parse($expiry)]);

        $this->extend($pm, $target, ['months' => $months])->assertOk();

        $this->assertSame($expected, $target->fresh()->access_expires_at->toDateString());
        $this->assertTrue($target->fresh()->access_expires_at->lessThanOrEqualTo(Carbon::parse('2030-02-28')->endOfDay()));
    }

    public function test_project_manager_does_not_change_the_date_of_a_super_admin(): void
    {
        $pm = $this->boundAccount('project_manager');
        $sa = $this->account('super_admin');

        $this->extend($pm, $sa, ['until' => '2027-06-01'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden')
            ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);

        $this->assertNothingChanged($sa);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function administrationRoles(): array
    {
        return ['opiekun projektu' => ['project_manager'], 'super admin' => ['super_admin']];
    }

    #[DataProvider('administrationRoles')]
    public function test_nobody_changes_the_date_of_their_own_account(string $role): void
    {
        $self = $this->account($role);

        foreach ([['until' => '2027-06-01'], ['months' => 1]] as $body) {
            $this->extend($self, $self, $body)
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'cannot_extend_self')
                ->assertJsonPath('error.message', 'Nie można zmienić daty dostępu własnego konta.');
        }

        $this->assertNothingChanged($self);
    }

    public function test_the_refusal_for_own_account_comes_before_the_body_is_validated(): void
    {
        $self = $this->account('project_manager');

        $this->extend($self, $self, ['until' => '2000-01-01', 'reason' => ''])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'cannot_extend_self');

        $this->assertNothingChanged($self);
    }

    public function test_a_super_admin_target_stays_out_of_reach_of_the_project_manager_whatever_the_date(): void
    {
        $pm = $this->boundAccount('project_manager');
        $sa = $this->account('super_admin');

        foreach (['2000-01-01', '2026-10-03', '2099-01-01'] as $until) {
            $this->extend($pm, $sa, ['until' => $until])
                ->assertStatus(403)
                ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }

        $this->assertNothingChanged($sa);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function staffTargets(): array
    {
        return [
            'prowadzący, zmienia opiekun projektu' => ['project_manager', 'instructor'],
            'opiekun projektu, zmienia opiekun projektu' => ['project_manager', 'project_manager'],
            'prowadzący, zmienia Super Admin' => ['super_admin', 'instructor'],
            'opiekun projektu, zmienia Super Admin' => ['super_admin', 'project_manager'],
            'Super Admin, zmienia Super Admin' => ['super_admin', 'super_admin'],
        ];
    }

    #[DataProvider('staffTargets')]
    public function test_accounts_without_a_term_refuse_a_date_change_in_both_modes(string $actorRole, string $targetRole): void
    {
        $actor = $this->boundAccount($actorRole);
        $target = $this->account($targetRole);

        foreach ([['until' => '2027-06-01'], ['months' => 3], ['until' => '2000-01-01', 'reason' => '']] as $body) {
            $this->extend($actor, $target, $body)
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'access_date_not_applicable')
                ->assertJsonPath('error.message', self::NOT_APPLICABLE);
        }

        $this->assertNothingChanged($target);
    }

    #[DataProvider('programRoles')]
    public function test_people_in_the_program_get_their_date_changed(string $role): void
    {
        $pm = $this->boundAccount('project_manager');
        $target = $this->account($role);

        $this->extend($pm, $target, ['until' => '2027-06-01'])->assertOk();

        $this->assertSame('2027-06-01', $target->fresh()->access_expires_at->toDateString());
        $this->assertSame(1, AccessDateChange::query()->count());
        $this->assertSame(1, AuditLogEntry::query()->where('action', 'access.extended')->count());
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function programRoles(): array
    {
        return ['wolontariusz' => ['volunteer'], 'student' => ['student']];
    }
}
