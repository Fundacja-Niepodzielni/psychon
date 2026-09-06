<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Test;
use App\Models\User;
use App\Support\CourseAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · rozwiązywanie testu — kryterium 1 (próg 80%, odblokowanie etapu)
 * oraz kształt odpowiedzi i walidacja.
 */
class TakeTestTest extends TestPackageCase
{
    use RefreshDatabase;

    public function test_get_test_returns_questions_without_correctness_flags(): void
    {
        $test = $this->makeTest();
        Sanctum::actingAs($this->volunteer());

        $response = $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertOk()
            ->assertJsonPath('data.test_id', $test->id)
            ->assertJsonPath('data.pass_threshold', 80)
            ->assertJsonPath('data.attempts_used', 0)
            ->assertJsonPath('data.attempts_limit', 3)
            ->assertJsonCount(10, 'data.questions');

        $firstAnswer = $response->json('data.questions.0.answers.0');
        $this->assertArrayHasKey('id', $firstAnswer);
        $this->assertArrayHasKey('body', $firstAnswer);
        $this->assertArrayNotHasKey('is_correct', $firstAnswer);
        $response->assertJsonMissing(['is_correct' => true]);
    }

    public function test_eighty_percent_passes_and_seventy_nine_fails(): void
    {
        // 100 pytań → wynik w procentach = liczba poprawnych.
        $test = $this->makeTest(questions: 100);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 79),
        ])->assertCreated()
            ->assertJsonPath('data.score_percent', 79)
            ->assertJsonPath('data.passed', false);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 80),
        ])->assertCreated()
            ->assertJsonPath('data.score_percent', 80)
            ->assertJsonPath('data.passed', true);
    }

    public function test_passing_the_test_unlocks_the_next_stage(): void
    {
        $edition = $this->activeEdition();

        $courseA = Course::create([
            'title' => 'Etap A', 'slug' => 'etap-a', 'type' => 'course',
            'product_group' => 'psychon', 'sequence_order' => 1,
            'edition_id' => $edition->id, 'is_published' => true,
        ]);
        $lessonA = Lesson::create([
            'course_id' => $courseA->id, 'title' => 'L1', 'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
        $courseB = Course::create([
            'title' => 'Etap B', 'slug' => 'etap-b', 'type' => 'course',
            'product_group' => 'psychon', 'sequence_order' => 2,
            'edition_id' => $edition->id, 'is_published' => true,
        ]);

        $test = $courseA->test()->create(['question_count' => 10]);
        foreach (range(1, 10) as $n) {
            $q = $test->questions()->create(['body' => "P{$n}", 'sequence_order' => $n]);
            $q->answers()->create(['body' => 'ok', 'is_correct' => true]);
            $q->answers()->create(['body' => 'no', 'is_correct' => false]);
        }
        $test = $test->fresh(['questions.answers', 'course']);

        $user = $this->volunteer();
        LessonProgress::create([
            'user_id' => $user->id, 'lesson_id' => $lessonA->id,
            'watched_seconds' => 600, 'active_seconds' => 600,
            'is_completed' => true, 'completed_at' => now(),
        ]);

        // Etap B zablokowany, dopóki test etapu A nie jest zdany.
        $this->assertSame('locked', CourseAccess::state($user, $courseB)['status']);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 10),
        ])->assertCreated()->assertJsonPath('data.passed', true);

        $this->assertSame('completed', CourseAccess::state($user->fresh(), $courseA)['status']);
        $this->assertSame('in_progress', CourseAccess::state($user->fresh(), $courseB)['status']);
    }

    public function test_wrong_question_ids_are_reported(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $wrongIds = $test->questions()->orderBy('sequence_order')->pluck('id')->slice(8)->values();

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 8),
        ])->assertCreated()
            ->assertJsonPath('data.score_percent', 80)
            ->assertJsonPath('data.wrong_question_ids', $wrongIds->all());
    }

    public function test_answer_outside_the_question_is_rejected(): void
    {
        $test = $this->makeTest(questions: 3);
        $otherTest = $this->makeTest(questions: 3);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $answers = $this->answersFor($test, 3);
        // Podmień jedną odpowiedź na należącą do innego testu.
        $foreignAnswer = $otherTest->questions()->first()->answers()->first()->id;
        $answers[(string) $test->questions()->first()->id] = $foreignAnswer;

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $answers])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertDatabaseCount('test_attempts', 0);
    }

    public function test_locked_course_test_is_forbidden(): void
    {
        $this->seed();
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $lockedTest = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail()->test;

        Sanctum::actingAs($marta);

        $this->getJson('/api/v1/courses/interwencja-kryzysowa/test')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');

        $this->postJson("/api/v1/tests/{$lockedTest->id}/attempts", [
            'answers' => [(string) $lockedTest->questions()->first()->id => $lockedTest->questions()->first()->answers()->first()->id],
        ])->assertStatus(403)->assertJsonPath('error.code', 'course_locked');
    }

    public function test_test_taking_routes_require_a_participant_role(): void
    {
        $test = $this->makeTest();
        Sanctum::actingAs(User::factory()->create(['role' => 'instructor']));

        $this->getJson("/api/v1/courses/{$test->course->slug}/test")->assertStatus(403);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => []])->assertStatus(403);
    }

    public function test_test_taking_requires_authentication(): void
    {
        $test = $this->makeTest();
        $this->getJson("/api/v1/courses/{$test->course->slug}/test")->assertStatus(401);
    }
}
