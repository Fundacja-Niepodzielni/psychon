<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\Test as KnowledgeTest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Prowadzący zakłada i edytuje test wiedzy wyłącznie kursu, do którego jest
 * aktywnie przypisany — trasy `role:instructor` w `routes/api/h10.php`,
 * warunek pilnowany przez `CoursePolicy` (ta sama polityka co treść kursu
 * w pakiecie H08).
 */
class InstructorTestManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_instructor_creates_a_test_for_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/tests", [
            'pass_threshold' => 80,
        ])
            ->assertCreated()
            ->assertJsonPath('data.course_id', $course->id)
            ->assertJsonPath('data.pass_threshold', 80);
    }

    public function test_assigned_instructor_reads_own_course_test(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);
        KnowledgeTest::create(['course_id' => $course->id]);

        $this->actingAs($instructor, 'keycloak');

        $this->getJson("/api/v1/instructor/courses/{$course->id}/tests")
            ->assertOk()
            ->assertJsonPath('data.course_id', $course->id);
    }

    public function test_assigned_instructor_updates_own_course_test(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);
        $test = KnowledgeTest::create(['course_id' => $course->id]);

        $this->actingAs($instructor, 'keycloak');

        $this->patchJson("/api/v1/instructor/tests/{$test->id}", [
            'attempts_limit' => 3,
        ])->assertOk()->assertJsonPath('data.attempts_limit', 3);
    }

    public function test_test_creation_is_forbidden_on_a_foreign_course(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/tests", [])
            ->assertStatus(403);

        $this->assertSame(0, KnowledgeTest::count());
    }

    public function test_test_update_is_forbidden_on_a_foreign_course(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $test = KnowledgeTest::create(['course_id' => $course->id]);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->patchJson("/api/v1/instructor/tests/{$test->id}", [
            'attempts_limit' => 1,
        ])->assertStatus(403);
    }

    public function test_administration_is_forbidden_on_instructor_test_routes(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $admin = User::factory()->role('super_admin')->create();

        $this->actingAs($admin, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/tests", [])
            ->assertStatus(403);
    }

    public function test_participant_is_forbidden_on_instructor_test_routes(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $student = User::factory()->role('student')->create();

        $this->actingAs($student, 'keycloak');

        $this->getJson("/api/v1/instructor/courses/{$course->id}/tests")
            ->assertStatus(403);
    }

    /**
     * `TestGrader` czyta próg i limit z aktywnej edycji, gdy test ich nie
     * ustawia wprost — bez edycji sam odczyt testu wywraca się w kontrolerze.
     */
    private function activeEdition(): Edition
    {
        return Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja testowa',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
    }

    private function course(string $slug, array $attributes = []): Course
    {
        return Course::create($attributes + [
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->activeEdition()->id,
            'is_published' => false,
        ]);
    }

    private function assignedInstructor(Course $course): User
    {
        $instructor = User::factory()->role('instructor')->create();

        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);

        return $instructor;
    }
}
