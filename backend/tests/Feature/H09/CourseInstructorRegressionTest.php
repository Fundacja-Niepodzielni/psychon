<?php

namespace Tests\Feature\H09;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Brak regresji krytycznej — zmiana przypisań musi poprawnie zasilać
 * `GET /courses/{slug}` → `data.instructor` (kontrakt §2 „Kursy"), bez zmiany
 * kształtu pozostałych pól odpowiedzi.
 */
class CourseInstructorRegressionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_assignment_lifecycle_drives_the_course_instructor_field(): void
    {
        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();
        $joanna = User::where('email', 'joanna@demo.pl')->firstOrFail();
        $newInstructor = User::factory()->role('instructor')->create([
            'first_name' => 'Ida', 'last_name' => 'Nowak',
        ]);
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();

        // Baseline: seed puts Joanna on the course.
        $this->actingAs(User::where('email', 'marta@demo.pl')->firstOrFail(), 'keycloak');
        $baseline = $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk();
        $baseline->assertJsonPath('data.instructor.id', $joanna->id);
        $shape = array_keys($baseline->json('data'));

        // Unassign → data.instructor becomes null, shape unchanged.
        $assignment = $course->assignments()->whereNull('unassigned_at')->firstOrFail();
        $this->actingAs($admin, 'keycloak');
        $this->deleteJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'assignment_id' => $assignment->id,
        ])->assertOk();

        $this->actingAs(User::where('email', 'marta@demo.pl')->firstOrFail(), 'keycloak');
        $afterRemove = $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk();
        $afterRemove->assertJsonPath('data.instructor', null);
        $this->assertSame($shape, array_keys($afterRemove->json('data')));

        // Reassign to a different instructor → data.instructor points at them.
        $this->actingAs($admin, 'keycloak');
        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", [
            'instructor_id' => $newInstructor->id,
        ])->assertCreated();

        $this->actingAs(User::where('email', 'marta@demo.pl')->firstOrFail(), 'keycloak');
        $this->getJson('/api/v1/courses/wywiad-psychologiczny')
            ->assertOk()
            ->assertJsonPath('data.instructor.id', $newInstructor->id)
            ->assertJsonPath('data.instructor.name', 'Ida Nowak');
    }
}
