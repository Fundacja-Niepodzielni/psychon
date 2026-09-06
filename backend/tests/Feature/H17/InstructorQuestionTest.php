<?php

namespace Tests\Feature\H17;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Instructor inbox and answering — H17 acceptance criteria 2 ★ and 3.
 */
class InstructorQuestionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_inbox_returns_the_agreed_shape(): void
    {
        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $response = $this->getJson('/api/v1/instructor/questions')->assertOk();

        $this->assertSame(
            ['id', 'lesson_id', 'question', 'answer', 'answered_by', 'answered_by_name',
                'answered_at', 'created_at', 'updated_at', 'user', 'lesson'],
            array_keys($response->json('data.0')),
        );
        $this->assertSame(['id', 'first_name', 'last_name'], array_keys($response->json('data.0.user')));
        $this->assertSame(['id', 'title', 'course'], array_keys($response->json('data.0.lesson')));
        $this->assertSame(['id', 'slug', 'title'], array_keys($response->json('data.0.lesson.course')));
        $this->assertSame(
            ['current_page', 'per_page', 'total', 'last_page', 'extra'],
            array_keys($response->json('meta')),
        );
        $this->assertSame(['unanswered'], array_keys($response->json('meta.extra')));
    }

    public function test_instructor_sees_only_their_own_questions(): void
    {
        $foreign = $this->foreignQuestion();

        Sanctum::actingAs($this->user('joanna@demo.pl'));
        $response = $this->getJson('/api/v1/instructor/questions')->assertOk();

        $this->assertNotContains($foreign->id, array_column($response->json('data'), 'id'));
    }

    public function test_unanswered_filter_and_counter_are_independent(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $lesson = $this->joannasLesson();
        $marta = $this->user('marta@demo.pl');

        // Seed already holds one unanswered question on this lesson; add two answered.
        foreach (['Pierwsze', 'Drugie'] as $body) {
            InstructorQuestion::create([
                'user_id' => $marta->id,
                'lesson_id' => $lesson->id,
                'question' => $body,
                'answer' => 'Odpowiedź.',
                'answered_by' => $joanna->id,
                'answered_at' => now(),
            ]);
        }

        Sanctum::actingAs($joanna);

        $unanswered = $this->getJson('/api/v1/instructor/questions?answered=false')->assertOk();
        $this->assertSame(1, $unanswered->json('meta.total'));
        $this->assertSame(1, $unanswered->json('meta.extra.unanswered'));

        $answered = $this->getJson('/api/v1/instructor/questions?answered=true')->assertOk();
        $this->assertSame(2, $answered->json('meta.total'));
        // The badge counts the whole inbox, so the filter must not move it.
        $this->assertSame(1, $answered->json('meta.extra.unanswered'));
    }

    public function test_participant_cannot_open_the_inbox(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson('/api/v1/instructor/questions')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_instructor_answers_a_question_and_notifies_the_asker(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $marta = $this->user('marta@demo.pl');
        $question = InstructorQuestion::where('user_id', $marta->id)->firstOrFail();

        Sanctum::actingAs($joanna);
        $response = $this->postJson("/api/v1/instructor/questions/{$question->id}/answer", [
            'answer' => 'Zostaw ciszę i poczekaj.',
        ])->assertOk();

        $this->assertSame('Zostaw ciszę i poczekaj.', $response->json('data.answer'));
        $this->assertSame($joanna->id, $response->json('data.answered_by'));
        $this->assertNotNull($response->json('data.answered_at'));

        $notification = Notification::where('user_id', $marta->id)
            ->where('type', 'question.answered')
            ->sole();
        $this->assertSame(
            '/panel/kursy/'.$question->lesson->course->slug,
            $notification->link,
        );
    }

    public function test_foreign_question_is_indistinguishable_from_a_missing_one(): void
    {
        $foreign = $this->foreignQuestion();

        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $this->postJson("/api/v1/instructor/questions/{$foreign->id}/answer", ['answer' => 'Odpowiedź.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->postJson('/api/v1/instructor/questions/999999/answer', ['answer' => 'Odpowiedź.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertNull($foreign->refresh()->answered_at);
    }

    public function test_answering_twice_is_locked(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $question = InstructorQuestion::where('user_id', $this->user('marta@demo.pl')->id)->firstOrFail();

        Sanctum::actingAs($joanna);
        $this->postJson("/api/v1/instructor/questions/{$question->id}/answer", [
            'answer' => 'Pierwsza odpowiedź.',
        ])->assertOk();

        $question->refresh();
        $notificationsBefore = Notification::count();

        $this->postJson("/api/v1/instructor/questions/{$question->id}/answer", [
            'answer' => 'Druga odpowiedź.',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'entry_locked');

        $unchanged = $question->refresh();
        $this->assertSame('Pierwsza odpowiedź.', $unchanged->answer);
        $this->assertSame($joanna->id, $unchanged->answered_by);
        $this->assertSame($notificationsBefore, Notification::count());
    }

    public function test_blank_answer_is_rejected_without_notification(): void
    {
        $question = InstructorQuestion::where('user_id', $this->user('marta@demo.pl')->id)->firstOrFail();
        $before = Notification::count();

        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $this->postJson("/api/v1/instructor/questions/{$question->id}/answer", ['answer' => '  '])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['answer']]]);

        $this->assertNull($question->refresh()->answered_at);
        $this->assertSame($before, Notification::count());
    }

    public function test_answering_writes_no_audit_entry(): void
    {
        $question = InstructorQuestion::where('user_id', $this->user('marta@demo.pl')->id)->firstOrFail();
        $before = AuditLogEntry::count();

        Sanctum::actingAs($this->user('joanna@demo.pl'));
        $this->postJson("/api/v1/instructor/questions/{$question->id}/answer", [
            'answer' => 'Odpowiedź bez audytu.',
        ])->assertOk();

        $this->assertSame($before, AuditLogEntry::count());
    }

    public function test_question_content_is_stored_verbatim(): void
    {
        $lesson = $this->joannasLesson();
        $payload = '<script>alert(1)</script>';

        Sanctum::actingAs($this->user('marta@demo.pl'));
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => $payload])
            ->assertCreated()
            ->assertJsonPath('data.question', $payload);

        Sanctum::actingAs($this->user('joanna@demo.pl'));
        $inbox = $this->getJson('/api/v1/instructor/questions?answered=false')->assertOk();

        $this->assertContains($payload, array_column($inbox->json('data'), 'question'));
    }

    /**
     * A question on a course joanna does not run — the inbox must never show it.
     */
    private function foreignQuestion(): InstructorQuestion
    {
        $other = User::factory()->create(['role' => 'instructor']);
        $course = Course::create([
            'title' => 'Kurs innej prowadzącej',
            'slug' => 'kurs-innej-prowadzacej',
            'sequence_order' => null,
            'is_published' => true,
        ]);
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja obca',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
        CourseAssignment::create([
            'course_id' => $course->id,
            'instructor_id' => $other->id,
            'assigned_at' => now()->subDay(),
        ]);

        return InstructorQuestion::create([
            'user_id' => $this->user('marta@demo.pl')->id,
            'lesson_id' => $lesson->id,
            'question' => 'Pytanie do innej prowadzącej.',
        ]);
    }

    private function joannasLesson(): Lesson
    {
        return Course::where('slug', 'wywiad-psychologiczny')
            ->firstOrFail()
            ->lessons()
            ->orderBy('sequence_order')
            ->firstOrFail();
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
