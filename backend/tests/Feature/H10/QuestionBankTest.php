<?php

namespace Tests\Feature\H10;

use App\Models\TestAttempt;
use App\Models\TestQuestion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · bank pytań w panelu — kryteria 3 i 6 (edycja/usuwanie pytania
 * nie zmienia historii podejść dzięki snapshotowi).
 */
class QuestionBankTest extends TestPackageCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'project_manager']);
    }

    public function test_admin_can_list_questions_with_correctness_flags(): void
    {
        $test = $this->makeTest(questions: 3);
        Sanctum::actingAs($this->admin());

        $this->getJson("/api/v1/admin/tests/{$test->id}/questions")
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.answers.0.is_correct', true)
            ->assertJsonPath('data.0.answers.1.is_correct', false);
    }

    public function test_admin_can_create_a_question(): void
    {
        $test = $this->makeTest(questions: 2);
        Sanctum::actingAs($this->admin());

        $this->postJson("/api/v1/admin/tests/{$test->id}/questions", [
            'body' => 'Nowe pytanie?',
            'answers' => [
                ['body' => 'A', 'is_correct' => true],
                ['body' => 'B', 'is_correct' => false],
                ['body' => 'C', 'is_correct' => false],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.body', 'Nowe pytanie?')
            ->assertJsonPath('data.sequence_order', 3)
            ->assertJsonCount(3, 'data.answers');

        $this->assertDatabaseCount('test_questions', 3);
    }

    public function test_create_requires_exactly_one_correct_answer(): void
    {
        $test = $this->makeTest(questions: 1);
        Sanctum::actingAs($this->admin());

        $this->postJson("/api/v1/admin/tests/{$test->id}/questions", [
            'body' => 'Złe pytanie?',
            'answers' => [
                ['body' => 'A', 'is_correct' => true],
                ['body' => 'B', 'is_correct' => true],
            ],
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_editing_a_question_does_not_change_a_past_attempt(): void
    {
        $test = $this->makeTest(questions: 5);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 5),
        ])->assertCreated()->assertJsonPath('data.score_percent', 100);

        $attempt = TestAttempt::firstOrFail();
        $snapshotBefore = $attempt->questions_snapshot;
        $firstQuestion = TestQuestion::orderBy('id')->firstOrFail();

        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/v1/admin/questions/{$firstQuestion->id}", [
            'body' => 'Zupełnie inna treść pytania?',
            'answers' => [
                ['body' => 'Nowa poprawna', 'is_correct' => true],
                ['body' => 'Nowa błędna', 'is_correct' => false],
            ],
        ])->assertOk()->assertJsonPath('data.body', 'Zupełnie inna treść pytania?');

        // Bank pytań zmieniony, ale snapshot podejścia nietknięty.
        $this->assertSame('Zupełnie inna treść pytania?', $firstQuestion->fresh()->body);
        $this->assertSame($snapshotBefore, $attempt->fresh()->questions_snapshot);
        $this->assertSame('Pytanie 1?', $attempt->fresh()->questions_snapshot[0]['body']);
        $this->assertSame(100, $attempt->fresh()->score_percent);
    }

    public function test_deleting_a_question_does_not_change_a_past_attempt(): void
    {
        $test = $this->makeTest(questions: 4);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 4),
        ])->assertCreated();

        $attempt = TestAttempt::firstOrFail();
        $snapshotBefore = $attempt->questions_snapshot;
        $question = TestQuestion::orderBy('id')->firstOrFail();

        Sanctum::actingAs($this->admin());
        $this->deleteJson("/api/v1/admin/questions/{$question->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('test_questions', ['id' => $question->id]);
        $this->assertCount(4, $attempt->fresh()->questions_snapshot);
        $this->assertSame($snapshotBefore, $attempt->fresh()->questions_snapshot);
    }

    public function test_question_bank_is_closed_to_non_admins(): void
    {
        $test = $this->makeTest(questions: 1);
        Sanctum::actingAs($this->volunteer());

        $this->getJson("/api/v1/admin/tests/{$test->id}/questions")->assertStatus(403);
        $this->postJson("/api/v1/admin/tests/{$test->id}/questions", [])->assertStatus(403);
    }
}
