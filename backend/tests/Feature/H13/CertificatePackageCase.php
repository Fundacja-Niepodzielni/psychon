<?php

namespace Tests\Feature\H13;

use App\Models\InternshipEntry;
use App\Models\LessonProgress;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use Tests\TestCase;

/**
 * Wspólne fixture'y pakietu H13. Testy jadą na `DemoSeeder` — `marta` jest
 * w trakcie programu, `ola` jest absolwentką z wydanym certyfikatem NP/2026/001.
 */
abstract class CertificatePackageCase extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    protected function marta(): User
    {
        return User::where('email', 'marta@demo.pl')->firstOrFail();
    }

    protected function ola(): User
    {
        return User::where('email', 'ola@demo.pl')->firstOrFail();
    }

    /**
     * Nowy uczestnik z kompletem czterech warunków, ale bez wydanego certyfikatu
     * i bez `program_completed_at` — kopiuje kwalifikujące dane od `oli`.
     */
    protected function makeEligibleVolunteer(): User
    {
        $ola = $this->ola();
        $joanna = User::where('email', 'joanna@demo.pl')->firstOrFail();

        $grad = User::factory()->create([
            'role' => 'volunteer',
            'edition_id' => $ola->edition_id,
            'program_completed_at' => null,
            'access_expires_at' => now()->addMonths(3),
        ]);

        foreach (LessonProgress::where('user_id', $ola->id)->get() as $progress) {
            LessonProgress::create([
                'user_id' => $grad->id,
                'lesson_id' => $progress->lesson_id,
                'watched_seconds' => $progress->watched_seconds,
                'active_seconds' => $progress->active_seconds,
                'open_count' => $progress->open_count,
                'last_activity_at' => $progress->last_activity_at,
                'is_completed' => true,
                'completed_at' => now()->subDays(10),
            ]);
        }

        foreach (TestAttempt::where('user_id', $ola->id)->get() as $attempt) {
            TestAttempt::create([
                'user_id' => $grad->id,
                'test_id' => $attempt->test_id,
                'attempt_number' => 1,
                'answers' => $attempt->answers,
                'questions_snapshot' => $attempt->questions_snapshot,
                'score_percent' => $attempt->score_percent,
                'passed' => true,
            ]);
        }

        InternshipEntry::create([
            'user_id' => $grad->id,
            'date' => now()->subDays(20)->toDateString(),
            'hours' => '72.0',
            'form' => 'phone_duty',
            'consultations_count' => 60,
            'description' => 'Staż — bez danych osób konsultowanych.',
            'status' => 'accepted',
            'decided_by' => $joanna->id,
            'decided_at' => now()->subDays(18),
        ]);

        foreach (range(1, 6) as $n) {
            $slot = SupervisionSlot::create([
                'supervisor_id' => $joanna->id,
                'starts_at' => now()->subWeeks($n * 2),
                'duration_minutes' => 90,
                'seats_limit' => 3,
            ]);

            SupervisionSignup::create([
                'slot_id' => $slot->id,
                'user_id' => $grad->id,
                'signed_up_at' => $slot->starts_at->copy()->subDays(5),
                'attendance' => 'present',
                'attendance_marked_by' => $joanna->id,
            ]);
        }

        WorkshopCompletion::create([
            'user_id' => $grad->id,
            'edition_id' => $ola->edition_id,
            'completed_at' => now()->subMonth(),
        ]);

        return $grad->fresh();
    }
}
