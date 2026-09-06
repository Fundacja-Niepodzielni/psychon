<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Demo helper: marks every lesson of a course as completed for a user.
 * Completing a lesson belongs to H06 (POST /lessons/{id}/complete), but the
 * sequential unlock needs the previous course's lessons AND its test — so
 * demo:pass-test alone never opens the next stage. H05 ships its own command
 * to keep its acceptance criterion verifiable without H06.
 */
class DemoCompleteLessons extends Command
{
    protected $signature = 'demo:complete-lessons {email} {courseSlug}';

    protected $description = 'Oznacza wszystkie lekcje kursu jako ukończone (demo) — bez czekania na H06';

    /** Same active-time share the canonical seed uses for a diligent account. */
    private const float ACTIVE_SHARE = 0.85;

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();

        if ($user === null) {
            $this->error("Nie znaleziono użytkownika: {$this->argument('email')}");

            return self::FAILURE;
        }

        $course = Course::where('slug', $this->argument('courseSlug'))->first();

        if ($course === null) {
            $this->error("Nie znaleziono kursu: {$this->argument('courseSlug')}");

            return self::FAILURE;
        }

        $lessons = $course->lessons()->get();

        if ($lessons->isEmpty()) {
            $this->error("Kurs „{$course->title}” nie ma lekcji.");

            return self::FAILURE;
        }

        $completed = 0;

        foreach ($lessons as $lesson) {
            if ($this->completeLesson($user, $lesson)) {
                $completed++;
            }
        }

        $this->info(sprintf(
            'Ukończono %d z %d lekcji kursu „%s” dla %s (%d już było ukończonych).',
            $completed,
            $lessons->count(),
            $course->title,
            $user->email,
            $lessons->count() - $completed,
        ));

        return self::SUCCESS;
    }

    /**
     * @return bool whether this call was the one that completed the lesson
     */
    private function completeLesson(User $user, Lesson $lesson): bool
    {
        $progress = LessonProgress::firstOrNew([
            'user_id' => $user->id,
            'lesson_id' => $lesson->id,
        ]);

        if ($progress->exists && $progress->is_completed) {
            return false;
        }

        $active = (int) round($lesson->duration_seconds * self::ACTIVE_SHARE);

        $progress->fill([
            'watched_seconds' => max((int) $progress->watched_seconds, $lesson->duration_seconds),
            'active_seconds' => max((int) $progress->active_seconds, $active),
            'open_count' => max((int) $progress->open_count, 2),
            'last_activity_at' => now(),
            'is_completed' => true,
            'completed_at' => now(),
        ])->save();

        return true;
    }
}
