<?php

namespace Tests\Feature\H09;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * H09 kryterium 2 (★) — przypisanie/odpięcie → powiadomienie + audyt — oraz
 * niezmienniki przypisań (rola instructor, jedno aktywne na parę, odpięcie bez
 * DELETE). Kontrakt: brak sekcji §2, kształt potwierdza strażnik (K1–K12).
 */
class CourseAssignmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_admin_reads_active_assignments_of_a_course(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('podstawy-pomocy');

        $response = $this->getJson("/api/v1/admin/courses/{$course->id}/assignments")->assertOk();

        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.course_id', $course->id)
            ->assertJsonPath('data.0.lesson_id', null)
            ->assertJsonPath('data.0.instructor.id', $this->user('joanna@demo.pl')->id);
        $this->assertSame(
            ['id', 'course_id', 'lesson_id', 'instructor', 'assigned_by', 'assigned_at', 'unassigned_at'],
            array_keys($response->json('data.0')),
        );
    }

    public function test_unknown_course_returns_404(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));

        $this->getJson('/api/v1/admin/courses/999999/assignments')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_store_rejects_instructor_id_without_the_instructor_role(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('praca-z-emocjami');

        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $this->user('marta@demo.pl')->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.instructor_id.0', 'Wybrane konto nie jest prowadzącym.');

        $this->assertDatabaseCount('audit_log', AuditLogEntry::count());
    }

    public function test_store_rejects_lesson_from_another_course(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('praca-z-emocjami');
        $foreignLesson = $this->course('podstawy-pomocy')->lessons()->first();

        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $this->user('joanna@demo.pl')->id,
            'lesson_id' => $foreignLesson->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_store_assigns_instructor_to_a_whole_course_with_audit_and_notification(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('praca-z-emocjami');
        $joanna = $this->user('joanna@demo.pl');

        $response = $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $joanna->id,
        ])->assertCreated();

        $response->assertJsonPath('data.course_id', $course->id)
            ->assertJsonPath('data.lesson_id', null)
            ->assertJsonPath('data.instructor.id', $joanna->id)
            ->assertJsonPath('data.assigned_by', $this->user('admin@demo.pl')->id);
        $this->assertNotNull($response->json('data.assigned_at'));
        $this->assertNull($response->json('data.unassigned_at'));

        $this->assertDatabaseHas('audit_log', [
            'action' => 'assignment.created',
            'subject_id' => $response->json('data.id'),
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $joanna->id,
            'type' => 'assignment.created',
        ]);
        $this->assertDatabaseHas('emails', [
            'to_user_id' => $joanna->id,
            'status' => 'simulated',
        ]);
    }

    public function test_store_assigns_instructor_to_a_single_lesson(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('praca-z-emocjami');
        $lesson = $course->lessons()->first();

        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $this->user('joanna@demo.pl')->id,
            'lesson_id' => $lesson->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.lesson_id', $lesson->id);
    }

    public function test_store_rejects_a_second_active_assignment_for_the_same_pair(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('podstawy-pomocy'); // Joanna already runs it (course-level)
        $other = User::factory()->role('instructor')->create();
        $before = CourseAssignment::count();

        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $other->id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.assignment_id', fn ($id): bool => is_int($id));

        $this->assertSame($before, CourseAssignment::count());
    }

    public function test_destroy_unassigns_without_deleting_the_row_and_notifies(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('wywiad-psychologiczny');
        $assignment = $course->assignments()->whereNull('unassigned_at')->firstOrFail();
        $joanna = $this->user('joanna@demo.pl');

        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'assignment_id' => $assignment->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.id', $assignment->id);

        $this->assertDatabaseHas('course_assignments', ['id' => $assignment->id]);
        $this->assertNotNull($assignment->fresh()->unassigned_at);
        $this->assertDatabaseHas('audit_log', [
            'action' => 'assignment.removed',
            'subject_id' => $assignment->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $joanna->id,
            'type' => 'assignment.removed',
        ]);
    }

    public function test_destroy_is_idempotent_guarded_and_makes_no_extra_audit(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('interwencja-kryzysowa');
        $assignment = $course->assignments()->whereNull('unassigned_at')->firstOrFail();

        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'assignment_id' => $assignment->id,
        ])->assertOk();

        $auditAfterFirst = AuditLogEntry::where('action', 'assignment.removed')->count();

        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'assignment_id' => $assignment->id,
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame($auditAfterFirst, AuditLogEntry::where('action', 'assignment.removed')->count());
        $this->assertSame(1, Notification::where('type', 'assignment.removed')->count());
    }

    public function test_destroy_requires_assignment_id(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $course = $this->course('podstawy-pomocy');

        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_destroy_rejects_an_assignment_from_another_course(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));
        $courseOne = $this->course('podstawy-pomocy');
        $courseTwo = $this->course('wywiad-psychologiczny');
        $assignmentOfOne = $courseOne->assignments()->whereNull('unassigned_at')->firstOrFail();

        $this->deleteJson("/api/v1/admin/courses/{$courseTwo->id}/assignments", [
            'assignment_id' => $assignmentOfOne->id,
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_assignments_are_closed_to_non_admin_roles(): void
    {
        $course = $this->course('podstawy-pomocy');

        foreach (['marta@demo.pl', 'filip@demo.pl', 'joanna@demo.pl'] as $email) {
            Sanctum::actingAs($this->user($email));

            $this->getJson("/api/v1/admin/courses/{$course->id}/assignments")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
            $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
                'instructor_id' => $this->user('joanna@demo.pl')->id,
            ])->assertStatus(403);
            $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
                'assignment_id' => 1,
            ])->assertStatus(403);
        }
    }

    public function test_assignments_require_authentication(): void
    {
        $course = $this->course('podstawy-pomocy');

        $this->getJson("/api/v1/admin/courses/{$course->id}/assignments")->assertStatus(401);
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }

    private function course(string $slug): Course
    {
        return Course::where('slug', $slug)->firstOrFail();
    }
}
