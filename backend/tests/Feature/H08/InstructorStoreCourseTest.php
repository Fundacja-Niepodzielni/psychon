<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * `POST /instructor/courses` — prowadzący zakłada własny kurs: lista
 * dozwolonych pól treści + `prohibited` dla pól stanu/przypisania/ścieżki.
 * Ten sam zasób co `POST /admin/courses` (`AdminCourseTest`), ta sama
 * ścieżka przypisań co `POST /admin/courses/{course}/assignments` (H09).
 */
class InstructorStoreCourseTest extends TestCase
{
    use RefreshDatabase;

    private const array VALID_BODY = [
        'title' => 'Kurs własny prowadzącego',
        'slug' => 'kurs-wlasny-prowadzacego',
        'description' => 'Opis kursu.',
        'type' => 'course',
    ];

    public function test_instructor_creates_unpublished_course_and_becomes_its_instructor(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $response = $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY)
            ->assertCreated();

        $this->assertFalse($response->json('data.is_published'));
        $courseId = $response->json('data.id');

        $course = Course::query()->findOrFail($courseId);
        $this->assertFalse($course->is_published);
        $this->assertSame('kurs-wlasny-prowadzacego', $course->slug);

        $this->assertDatabaseHas('course_assignments', [
            'course_id' => $course->id,
            'instructor_id' => $instructor->id,
            'lesson_id' => null,
            'unassigned_at' => null,
        ]);

        $this->assertSame(
            1,
            AuditLogEntry::query()->where('action', 'course.created')->where('subject_id', $course->id)->count(),
        );
    }

    public static function forbiddenCreatorRoles(): array
    {
        return [
            'wolontariusz' => ['volunteer'],
            'student' => ['student'],
        ];
    }

    #[DataProvider('forbiddenCreatorRoles')]
    public function test_only_instructor_may_create_a_course(string $role): void
    {
        $actor = User::factory()->role($role)->create();

        $this->actingAs($actor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertDatabaseCount('courses', 0);
    }

    public function test_guest_is_unauthenticated(): void
    {
        $this->postJson('/api/v1/instructor/courses', self::VALID_BODY)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertDatabaseCount('courses', 0);
    }

    public function test_is_published_field_is_prohibited(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $response = $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY + ['is_published' => true]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey('is_published', $response->json('error.errors'));

        $this->assertDatabaseCount('courses', 0);
    }

    public function test_instructor_id_field_is_prohibited(): void
    {
        $someoneElse = User::factory()->role('instructor')->create();
        $instructor = User::factory()->role('instructor')->create();

        $response = $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY + ['instructor_id' => $someoneElse->id]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey('instructor_id', $response->json('error.errors'));

        $this->assertDatabaseCount('courses', 0);
        $this->assertDatabaseCount('course_assignments', 0);
    }

    public function test_sequence_order_and_product_group_are_prohibited_in_a_single_attempt(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $response = $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY + [
                'sequence_order' => 3,
                'product_group' => 'dobrostan',
            ]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey('sequence_order', $response->json('error.errors'));
        $this->assertArrayHasKey('product_group', $response->json('error.errors'));

        $this->assertDatabaseCount('courses', 0);
    }

    public function test_new_course_is_invisible_in_volunteer_catalogue(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY)
            ->assertCreated();

        $volunteer = User::factory()->role('volunteer')->create();

        $slugs = collect(
            $this->actingAs($volunteer, 'keycloak')->getJson('/api/v1/courses')->assertOk()->json('data'),
        )->pluck('slug')->all();

        $this->assertNotContains('kurs-wlasny-prowadzacego', $slugs);
    }

    public function test_duplicate_slug_is_rejected(): void
    {
        Course::create([
            'title' => 'Istniejący kurs',
            'slug' => 'kurs-wlasny-prowadzacego',
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);

        $instructor = User::factory()->role('instructor')->create();

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/courses', self::VALID_BODY)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.slug.0', 'Kurs o takim identyfikatorze już istnieje.');

        $this->assertDatabaseCount('course_assignments', 0);
    }
}
