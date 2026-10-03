<?php

namespace Tests\Feature\Emails;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Terminy wysyłki według treści e-maili, z istniejących zadań cyklicznych:
 * E-25 dzień przed superwizją (tylko data i godzina), E-29 7 dni przed końcem
 * dostępu, E-30 dzień po nim, E-31 30 dni przed usunięciem danych konta
 * z wygasłym dostępem (12 miesięcy po końcu dostępu).
 */
class ScheduledEmailsTest extends TestCase
{
    use RefreshDatabase;

    private const string TODAY = '2026-10-03 10:00:00';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.frontend_url' => EmailTemplatesTest::BASE_URL]);
        Carbon::setTestNow(Carbon::parse(self::TODAY, config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function participant(string $accessEnds, array $attributes = []): User
    {
        return User::factory()->role('volunteer')->create([
            'access_expires_at' => Carbon::parse($accessEnds, config('app.timezone')),
            'program_completed_at' => null,
            ...$attributes,
        ]);
    }

    /**
     * @return list<string>
     */
    private function subjectsFor(User $user): array
    {
        return EmailMessage::query()->where('to_user_id', $user->id)->orderBy('id')->pluck('subject')->all();
    }

    private function runDaily(): void
    {
        $this->artisan('access:check-expired')->assertSuccessful();
    }

    // --- E-29: 7 dni przed końcem dostępu -----------------------------------------------

    public function test_e_29_goes_seven_days_before_access_ends_once(): void
    {
        $person = $this->participant('2026-10-10 00:00:00');

        $this->runDaily();
        $this->runDaily();

        $this->assertSame(['PsychON: dostęp kończy się za 7 dni'], $this->subjectsFor($person));
        $this->assertSame(1, Notification::query()->where('user_id', $person->id)->where('type', 'access.expiring_7d')->count());
    }

    public function test_e_29_does_not_go_on_other_days_or_after_the_program(): void
    {
        $sixDays = $this->participant('2026-10-09 12:00:00');
        $eightDays = $this->participant('2026-10-11 00:00:00');
        $graduate = $this->participant('2026-10-10 00:00:00', ['program_completed_at' => now()->subDay()]);
        $blocked = $this->participant('2026-10-10 00:00:00', ['status' => 'blocked']);

        $this->runDaily();

        foreach ([$sixDays, $eightDays, $graduate, $blocked] as $person) {
            $this->assertSame([], $this->subjectsFor($person));
            $this->assertSame(0, Notification::query()->where('user_id', $person->id)->count());
        }
    }

    // --- E-30: dzień po końcu dostępu ---------------------------------------------------

    public function test_e_30_goes_the_day_after_access_ended_once(): void
    {
        $person = $this->participant('2026-10-02 00:00:00');

        $this->runDaily();
        $this->runDaily();

        $this->assertSame(['PsychON: dostęp do materiałów się zakończył'], $this->subjectsFor($person));
        $this->assertSame(1, Notification::query()->where('user_id', $person->id)->where('type', 'access.expired')->count());
    }

    public function test_e_30_does_not_go_on_the_last_day_after_extension_or_after_the_program(): void
    {
        $endsToday = $this->participant('2026-10-03 00:00:00');
        $extended = $this->participant('2026-12-02 00:00:00');
        $graduate = $this->participant('2026-10-02 00:00:00', ['program_completed_at' => now()->subWeek()]);
        $twoDaysAgo = $this->participant('2026-10-01 00:00:00');

        $this->runDaily();

        foreach ([$endsToday, $extended, $graduate, $twoDaysAgo] as $person) {
            $this->assertSame([], $this->subjectsFor($person));
        }
    }

    // --- E-31: 30 dni przed usunięciem danych ---------------------------------------------

    public function test_e_31_goes_thirty_days_before_data_removal_once(): void
    {
        $person = $this->participant('2025-11-02 00:00:00');

        $this->runDaily();
        $this->runDaily();

        $rows = EmailMessage::query()->where('to_user_id', $person->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame('PsychON: usunięcie danych z nieaktywnego konta', $rows[0]->subject);
        $this->assertSame('simulated', $rows[0]->status);
        $this->assertStringContainsString('2 listopada 2026 r. usuniemy z niego Twoje dane osobowe', $rows[0]->body_html);
    }

    public function test_e_31_does_not_go_on_other_days_or_for_anonymized_or_completed_accounts(): void
    {
        $dayEarlier = $this->participant('2025-11-01 00:00:00');
        $dayLater = $this->participant('2025-11-03 00:00:00');
        $anonymized = $this->participant('2025-11-02 00:00:00', ['anonymized_at' => now()->subDay()]);
        $graduate = $this->participant('2025-11-02 00:00:00', ['program_completed_at' => now()->subYear()]);

        $this->runDaily();

        foreach ([$dayEarlier, $dayLater, $anonymized, $graduate] as $person) {
            $this->assertSame([], $this->subjectsFor($person));
        }
    }

    // --- E-25: dzień przed superwizją, tylko data i godzina --------------------------------

    private function signup(Carbon $startsAt): SupervisionSignup
    {
        $slot = SupervisionSlot::create([
            'supervisor_id' => User::factory()->role('instructor')->create()->id,
            'starts_at' => $startsAt,
            'duration_minutes' => 90,
            'seats_limit' => 5,
            'location_or_link' => 'Sala A, ul. Przykładowa 1',
        ]);

        return SupervisionSignup::create([
            'slot_id' => $slot->id,
            'user_id' => User::factory()->role('volunteer')->create()->id,
            'signed_up_at' => now(),
        ]);
    }

    public function test_e_25_goes_the_day_before_with_date_and_time_only(): void
    {
        $signup = $this->signup(Carbon::parse('2026-10-04 18:00:00', config('app.timezone')));

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $row = EmailMessage::query()->where('to_user_id', $signup->user_id)->sole();
        $this->assertSame('PsychON: jutro superwizja', $row->subject);
        $this->assertStringContainsString('jutro, 4 października 2026 o 18:00, masz superwizję', $row->body_html);
        $this->assertStringNotContainsString('Sala A', $row->body_html);
        $this->assertStringNotContainsString('Przykładowa', $row->body_html);
    }

    public function test_e_25_does_not_go_earlier_than_the_day_before(): void
    {
        $signup = $this->signup(Carbon::parse('2026-10-05 18:00:00', config('app.timezone')));

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $this->assertSame(0, EmailMessage::query()->where('to_user_id', $signup->user_id)->count());
    }
}
