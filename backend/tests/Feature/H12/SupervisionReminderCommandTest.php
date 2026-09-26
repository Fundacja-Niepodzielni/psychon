<?php

namespace Tests\Feature\H12;

use App\Models\Notification;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SupervisionReminderCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_two_runs_create_exactly_one_reminder_per_active_signup_for_tomorrow(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 08:00:00', config('app.timezone')));

        $tomorrow = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $first = $this->signup($tomorrow);
        $second = $this->signup($tomorrow);
        $withdrawn = $this->signup($tomorrow);
        $withdrawn->forceFill(['cancelled_at' => now()])->save();

        $later = $this->slot(Carbon::parse('2026-10-07 18:00:00', config('app.timezone')));
        $notYet = $this->signup($later);

        $this->artisan('supervision:send-reminders')->assertSuccessful();
        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $reminded = Notification::query()
            ->where('type', 'supervision.reminder')
            ->orderBy('user_id')
            ->pluck('user_id')
            ->all();

        $this->assertSame([$first->user_id, $second->user_id], $reminded);
        $this->assertNotNull($first->fresh()->reminder_sent_at);
        $this->assertNull($withdrawn->fresh()->reminder_sent_at);
        $this->assertNull($notYet->fresh()->reminder_sent_at);
    }

    public function test_a_signup_already_stamped_is_not_reminded_again(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 08:00:00', config('app.timezone')));

        $slot = $this->slot(Carbon::parse('2026-10-06 09:00:00', config('app.timezone')));
        $signup = $this->signup($slot);
        $signup->forceFill(['reminder_sent_at' => now()->subHour()])->save();

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        $this->assertSame(0, Notification::query()->where('type', 'supervision.reminder')->count());
    }

    public function test_the_command_is_scheduled_daily_at_eight(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn (Event $event): bool => str_contains((string) $event->command, 'supervision:send-reminders'));

        $this->assertCount(1, $events);
        $this->assertSame('0 8 * * *', $events->first()->expression);
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
