<?php

namespace Tests\Unit\Services\H12;

use App\Models\SupervisionSlot;
use App\Services\H12\SupervisionTiming;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Carbon;

/**
 * Boots the application (casts, clock) but never opens a database
 * connection, so it extends the framework base class rather than
 * `Tests\TestCase`, whose isolation guard queries the database first.
 */
class SupervisionTimingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-01T10:00:00Z'));
    }

    public function test_sign_up_is_open_before_the_slot_starts(): void
    {
        $this->assertTrue(SupervisionTiming::canSignUp($this->slot('2026-10-01T10:00:01Z', 60)));
    }

    public function test_sign_up_is_closed_at_and_after_the_start(): void
    {
        $this->assertFalse(SupervisionTiming::canSignUp($this->slot('2026-10-01T10:00:00Z', 60)));
        $this->assertFalse(SupervisionTiming::canSignUp($this->slot('2026-10-01T09:00:00Z', 60)));
    }

    public function test_attendance_can_be_marked_once_the_slot_has_ended(): void
    {
        $this->assertTrue(SupervisionTiming::canMarkAttendance($this->slot('2026-10-01T09:00:00Z', 60)));
        $this->assertTrue(SupervisionTiming::canMarkAttendance($this->slot('2026-10-01T08:00:00Z', 60)));
    }

    public function test_attendance_cannot_be_marked_before_or_during_the_slot(): void
    {
        $this->assertFalse(SupervisionTiming::canMarkAttendance($this->slot('2026-10-01T09:00:01Z', 60)));
        $this->assertFalse(SupervisionTiming::canMarkAttendance($this->slot('2026-10-01T11:00:00Z', 60)));
    }

    public function test_attendance_window_follows_the_slot_duration(): void
    {
        $slot = $this->slot('2026-10-01T09:30:00Z', 30);

        $this->assertTrue(SupervisionTiming::canMarkAttendance($slot));
        $this->assertFalse(SupervisionTiming::canMarkAttendance($this->slot('2026-10-01T09:30:00Z', 31)));
    }

    public function test_checks_do_not_mutate_the_slot_start(): void
    {
        $slot = $this->slot('2026-10-01T09:00:00Z', 60);

        SupervisionTiming::canMarkAttendance($slot);

        $this->assertSame('2026-10-01T09:00:00+00:00', $slot->starts_at->toIso8601String());
    }

    private function slot(string $startsAt, int $durationMinutes): SupervisionSlot
    {
        return new SupervisionSlot([
            'starts_at' => Carbon::parse($startsAt),
            'duration_minutes' => $durationMinutes,
        ]);
    }
}
