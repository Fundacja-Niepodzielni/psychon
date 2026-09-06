<?php

namespace Tests\Feature\H17;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Participant side of H17 on the demo seed: joanna@demo.pl runs courses 1–3 at
 * course level, marta@demo.pl has course 2 unlocked and course 3 locked.
 */
class LessonQuestionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_participant_can_ask_a_question_about_an_unlocked_lesson(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $response = $this->postJson(
            "/api/v1/lessons/{$this->unlockedLesson()->id}/questions",
            ['question' => 'Jak reagować na milczenie?'],
        )->assertCreated();

        $this->assertSame(
            ['id', 'lesson_id', 'question', 'answer', 'answered_by_name',
                'answered_at', 'created_at', 'updated_at'],
            array_keys($response->json('data')),
        );
        $this->assertSame('Jak reagować na milczenie?', $response->json('data.question'));
        $this->assertNull($response->json('data.answer'));
        $this->assertNull($response->json('data.answered_by_name'));
        $this->assertNull($response->json('data.answered_at'));
    }

    public function test_asking_notifies_the_inherited_instructor_only(): void
    {
        $marta = $this->user('marta@demo.pl');
        $joanna = $this->user('joanna@demo.pl');
        Sanctum::actingAs($marta);

        $this->postJson(
            "/api/v1/lessons/{$this->unlockedLesson()->id}/questions",
            ['question' => 'Pytanie do prowadzącej.'],
        )->assertCreated();

        $this->assertSame(1, Notification::where('user_id', $joanna->id)
            ->where('type', 'question.asked')->count());
        $this->assertSame(0, Notification::where('user_id', $marta->id)
            ->where('type', 'question.asked')->count());
    }

    public function test_no_notification_when_the_lesson_has_no_addressee(): void
    {
        $lesson = $this->unlockedLesson();
        $lesson->course->assignments()->update(['unassigned_at' => now()]);
        $before = Notification::count();

        Sanctum::actingAs($this->user('marta@demo.pl'));
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", [
            'question' => 'Pytanie bez adresata.',
        ])->assertCreated();

        $this->assertSame($before, Notification::count());
        $this->assertSame(1, InstructorQuestion::where('lesson_id', $lesson->id)
            ->where('question', 'Pytanie bez adresata.')->count());
    }

    public function test_question_about_a_locked_course_is_refused_and_stores_nothing(): void
    {
        $locked = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail();
        $lesson = $locked->lessons()->orderBy('sequence_order')->firstOrFail();
        $before = InstructorQuestion::count();

        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", [
            'question' => 'Pytanie do zablokowanego kursu.',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');

        $this->assertSame($before, InstructorQuestion::count());
    }

    public function test_blank_question_is_rejected(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->postJson("/api/v1/lessons/{$this->unlockedLesson()->id}/questions", [
            'question' => '   ',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['question']]]);
    }

    public function test_missing_lesson_is_not_found(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->postJson('/api/v1/lessons/999999/questions', ['question' => 'Pytanie.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_instructor_cannot_use_the_participant_route(): void
    {
        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $this->postJson("/api/v1/lessons/{$this->unlockedLesson()->id}/questions", [
            'question' => 'Pytanie od prowadzącej.',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_participant_sees_only_their_own_questions_at_the_lesson(): void
    {
        $lesson = $this->unlockedLesson();
        $marta = $this->user('marta@demo.pl');
        $other = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => now()->addYear(),
        ]);

        $mine = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Moje pytanie.',
            'answer' => 'Odpowiedź prowadzącej.',
            'answered_by' => $this->user('joanna@demo.pl')->id,
            'answered_at' => now(),
        ]);
        InstructorQuestion::create([
            'user_id' => $other->id,
            'lesson_id' => $lesson->id,
            'question' => 'Cudze pytanie.',
        ]);

        Sanctum::actingAs($marta);
        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/questions")->assertOk();

        // The demo seed already gives marta one question on this very lesson,
        // so the assertion is „mine and only mine", not „exactly one".
        $returned = array_column($response->json('data'), 'id');
        $this->assertContains($mine->id, $returned);
        $this->assertSame(
            InstructorQuestion::where('lesson_id', $lesson->id)
                ->where('user_id', $marta->id)
                ->count(),
            $response->json('meta.total'),
        );
        $this->assertSame(
            [],
            array_diff($returned, InstructorQuestion::where('user_id', $marta->id)->pluck('id')->all()),
        );

        // Newest first, so the question created here leads.
        $this->assertSame($mine->id, $returned[0]);
        $this->assertSame('Odpowiedź prowadzącej.', $response->json('data.0.answer'));
        $this->assertSame('Joanna Demo', $response->json('data.0.answered_by_name'));
        $this->assertNotNull($response->json('data.0.answered_at'));
    }

    public function test_listing_questions_of_a_locked_course_is_refused(): void
    {
        $locked = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail();
        $lesson = $locked->lessons()->orderBy('sequence_order')->firstOrFail();

        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson("/api/v1/lessons/{$lesson->id}/questions")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');
    }

    public function test_package_writes_no_audit_entries(): void
    {
        $before = AuditLogEntry::count();

        Sanctum::actingAs($this->user('marta@demo.pl'));
        $this->postJson("/api/v1/lessons/{$this->unlockedLesson()->id}/questions", [
            'question' => 'Pytanie bez audytu.',
        ])->assertCreated();

        $this->assertSame($before, AuditLogEntry::count());
    }

    private function unlockedLesson(): Lesson
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
