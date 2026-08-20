<?php

namespace App\Console\Commands;

use App\Models\Course;
use App\Models\TestAttempt;
use App\Models\TestQuestion;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Demo helper: passes a course test for a user (100%, snapshot included)
 * so the sequential unlock can be shown without clicking through a test.
 */
class DemoPassTest extends Command
{
    protected $signature = 'demo:pass-test {email} {courseSlug}';

    protected $description = 'Zalicza test kursu za użytkownika (demo) — podejście 100% ze snapshotem pytań';

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

        $test = $course->test;

        if ($test === null) {
            $this->error("Kurs „{$course->title}” nie ma testu.");

            return self::FAILURE;
        }

        $attempt = DB::transaction(function () use ($user, $test): TestAttempt {
            // Postgres forbids FOR UPDATE with aggregates — lock the rows,
            // then compute the max in PHP.
            $attemptNumber = 1 + (int) TestAttempt::query()
                ->where('user_id', $user->id)
                ->where('test_id', $test->id)
                ->lockForUpdate()
                ->pluck('attempt_number')
                ->max();

            $questions = $test->questions()->with('answers')->get();

            $answers = [];
            $snapshot = [];

            foreach ($questions as $question) {
                /** @var TestQuestion $question */
                $correct = $question->answers->firstWhere('is_correct', true);
                $answers[(string) $question->id] = $correct?->id;

                $snapshot[] = [
                    'id' => $question->id,
                    'body' => $question->body,
                    'answers' => $question->answers->map(fn ($answer): array => [
                        'id' => $answer->id,
                        'body' => $answer->body,
                        'is_correct' => $answer->is_correct,
                    ])->all(),
                ];
            }

            return TestAttempt::create([
                'user_id' => $user->id,
                'test_id' => $test->id,
                'attempt_number' => $attemptNumber,
                'answers' => $answers,
                'questions_snapshot' => $snapshot,
                'score_percent' => 100,
                'passed' => true,
            ]);
        });

        $this->info("Zaliczono test kursu „{$course->title}” dla {$user->email} (podejście {$attempt->attempt_number}, 100%).");

        return self::SUCCESS;
    }
}
