<?php

namespace Tests\Feature\H16;

use App\Models\Notification;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use App\Support\NotificationSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Pakiet H16 · przypomnienie o superwizji sterowane administracją —
 * blok włącz/wyłącz i godzina `send_at`.
 *
 * Osobny plik od `Tests\Feature\H12\SupervisionReminderCommandTest`, który
 * zostaje bez zmian: te dwa testy dowodzą nowego zachowania, tamten dowodzi,
 * że stare zachowanie (ustawienia domyślne) zostało zachowane.
 */
class SupervisionReminderSettingsGatingTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_disabled_block_sends_nothing_even_past_send_at(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 09:00:00', config('app.timezone')));
        NotificationSettings::put(['supervision_reminder' => ['enabled' => false]]);

        $slot = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $signup = $this->signup($slot);

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $this->assertSame(0, Notification::where('type', 'supervision.reminder')->count());
        $this->assertNull($signup->fresh()->reminder_sent_at);
    }

    public function test_hour_before_send_at_sends_nothing(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 13:00:00', config('app.timezone')));
        NotificationSettings::put(['supervision_reminder' => ['enabled' => true, 'send_at' => '14:00']]);

        $slot = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $signup = $this->signup($slot);

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $this->assertSame(0, Notification::where('type', 'supervision.reminder')->count());
        $this->assertNull($signup->fresh()->reminder_sent_at);
    }

    public function test_hour_at_or_after_send_at_sends_exactly_one(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 14:00:00', config('app.timezone')));
        NotificationSettings::put(['supervision_reminder' => ['enabled' => true, 'send_at' => '14:00']]);

        $slot = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $signup = $this->signup($slot);

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $this->assertSame(1, Notification::where('type', 'supervision.reminder')->count());
        $this->assertNotNull($signup->fresh()->reminder_sent_at);
    }

    public function test_send_at_moved_later_in_the_same_day_still_catches_the_signup(): void
    {
        // godzina wczesniejsza niz nowy send_at -> nic; po przesunieciu send_at wstecz
        // (albo o tej samej godzinie) reminder_sent_at wciaz pilnuje pojedynczej wysylki
        Carbon::setTestNow(Carbon::parse('2026-10-05 15:00:00', config('app.timezone')));
        NotificationSettings::put(['supervision_reminder' => ['enabled' => true, 'send_at' => '14:00']]);

        $slot = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $signup = $this->signup($slot);

        $this->artisan('supervision:send-reminders')->assertSuccessful();
        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $this->assertSame(1, Notification::where('type', 'supervision.reminder')->count());
    }

    public function test_default_settings_without_any_row_send_only_at_eight_oclock_once(): void
    {
        // Brak wiersza w `settings` w ogole - domyslne zachowanie sprzed tej zmiany:
        // blok wlaczony, `send_at` = 08:00. Zadnego wywolania `NotificationSettings::put`.
        $slot = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $signup = $this->signup($slot);

        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00', config('app.timezone')));
        $this->artisan('supervision:send-reminders')->assertSuccessful();
        $this->assertSame(0, Notification::where('type', 'supervision.reminder')->count());
        $this->assertNull($signup->fresh()->reminder_sent_at);

        Carbon::setTestNow(Carbon::parse('2026-10-05 08:00:00', config('app.timezone')));
        $this->artisan('supervision:send-reminders')->assertSuccessful();
        $this->assertSame(1, Notification::where('type', 'supervision.reminder')->count());
        $this->assertNotNull($signup->fresh()->reminder_sent_at);

        Carbon::setTestNow(Carbon::parse('2026-10-05 09:00:00', config('app.timezone')));
        $this->artisan('supervision:send-reminders')->assertSuccessful();
        $this->assertSame(1, Notification::where('type', 'supervision.reminder')->count());
    }

    private function slot(Carbon $startsAt): SupervisionSlot
    {
        return SupervisionSlot::create([
            'supervisor_id' => User::factory()->role('instructor')->create()->id,
            'starts_at' => $startsAt,
            'duration_minutes' => 90,
            'seats_limit' => 5,
            'location_or_link' => 'Sala A',
        ]);
    }

    private function signup(SupervisionSlot $slot): SupervisionSignup
    {
        return SupervisionSignup::create([
            'slot_id' => $slot->id,
            'user_id' => User::factory()->create(['role' => 'volunteer'])->id,
            'signed_up_at' => now(),
        ]);
    }
}
