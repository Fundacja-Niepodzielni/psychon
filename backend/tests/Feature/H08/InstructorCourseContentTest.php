<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\Material;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Prowadzący edytuje treść (opis, lekcje, materiały) wyłącznie kursu, do
 * którego jest aktywnie przypisany na poziomie kursu — trasy
 * `role:instructor` w `routes/api/h08.php`, warunek pilnowany przez
 * `CoursePolicy`. Każda metoda sprawdza jedno kryterium; kontrola
 * negatywna (uszkodzenie `CoursePolicy`) jest opisana w raporcie, nie
 * w kodzie testu.
 */
class InstructorCourseContentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_assigned_instructor_can_update_course_description(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'title' => 'Nowy tytuł treści',
            'description' => 'Nowa treść etapu.',
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Nowy tytuł treści')
            ->assertJsonPath('data.description', 'Nowa treść etapu.');

        $this->assertSame('Nowa treść etapu.', $course->fresh()->description);
    }

    public function test_assigned_instructor_reads_own_course(): void
    {
        $course = $this->course('etap-1', ['description' => 'Treść etapu.']);
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->getJson("/api/v1/instructor/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('data.description', 'Treść etapu.');
    }

    public function test_reading_a_foreign_course_is_forbidden(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->getJson("/api/v1/instructor/courses/{$course->id}")
            ->assertStatus(403);
    }

    public function test_instructor_cannot_change_publication_status_or_sequence(): void
    {
        $course = $this->course('etap-1', ['is_published' => false, 'sequence_order' => 3]);
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'is_published' => true,
            'sequence_order' => 9,
            'description' => 'Treść bez publikacji.',
        ])->assertOk();

        $fresh = $course->fresh();
        $this->assertFalse($fresh->is_published);
        $this->assertSame(3, $fresh->sequence_order);
        $this->assertSame('Treść bez publikacji.', $fresh->description);
    }

    public function test_instructor_gets_forbidden_on_a_foreign_course(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course); // someone else's assignment
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'description' => 'Nie moje.',
        ])->assertStatus(403)->assertJsonPath('error.code', 'forbidden');
    }

    /**
     * `FormRequest::authorize()` biegnie przed `rules()` — odmowa musi
     * wyprzedzać walidację ciała, inaczej cudze niepoprawne body dawało 422
     * zamiast 403 (`UpdateInstructorCourseRequest`).
     */
    public function test_foreign_course_update_is_forbidden_even_with_an_invalid_body(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'title' => str_repeat('a', 300),
        ])->assertStatus(403);
    }

    /**
     * `slug` cudzego kursu jako ciało nie może działać jak wyrocznia
     * istnienia identyfikatora — reguła `unique` z `UpdateCourseRequest`
     * biegnie tylko wtedy, gdy `authorize()` już przepuściło.
     */
    public function test_foreign_course_update_is_forbidden_with_another_courses_slug(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $this->course('etap-2');
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'slug' => 'etap-2',
        ])->assertStatus(403);
    }

    /**
     * Kontrola przeciwna do dwóch powyższych: własny kurs z niepoprawnym
     * ciałem dalej dostaje 422 — odmowa wyprzedza walidację tylko dla
     * nieprzypisanego prowadzącego, nie zastępuje jej dla właściciela.
     */
    public function test_own_course_update_with_invalid_body_is_unprocessable(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'title' => str_repeat('a', 300),
        ])->assertStatus(422);
    }

    public function test_administration_is_forbidden_on_instructor_course_route(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $admin = User::factory()->role('super_admin')->create();

        $this->actingAs($admin, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'description' => 'Administracja ma swoje trasy.',
        ])->assertStatus(403);
    }

    public function test_participant_is_forbidden_on_instructor_course_route(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $volunteer = User::factory()->role('volunteer')->create();

        $this->actingAs($volunteer, 'keycloak');

        $this->patchJson("/api/v1/instructor/courses/{$course->id}", [
            'description' => 'Uczestnik nie edytuje.',
        ])->assertStatus(403);
    }

    public function test_instructor_has_no_course_creation_route(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $this->actingAs($instructor, 'keycloak');

        // `GET /instructor/courses` (lista własnych kursów, H09) już zajmuje ten
        // adres, więc próba założenia kursu pod tym samym URL-em odbija się od
        // braku zarejestrowanej metody — 405, renderowany w tej samej kopercie
        // błędu co 403/404 (`ApiExceptionRenderer`). Brak jakiejkolwiek innej
        // trasy zakładania kursu dla prowadzącego (grep po `instructor/courses`
        // w `routes/api/h08.php` — jedyna metoda POST tam to materiały, nie kurs).
        $response = $this->postJson('/api/v1/instructor/courses', [
            'title' => 'Nowy kurs',
            'slug' => 'nowy-kurs',
        ]);

        $this->assertContains($response->getStatusCode(), [403, 404, 405]);
        $this->assertSame(0, Course::where('slug', 'nowy-kurs')->count());
    }

    public function test_assigned_instructor_lists_lessons_of_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);
        $lesson = $this->lesson($course, 'Lekcja 1', 1);

        $this->actingAs($instructor, 'keycloak');

        $this->getJson("/api/v1/instructor/courses/{$course->id}/lessons")
            ->assertOk()
            ->assertJsonPath('data.0.id', $lesson->id);
    }

    public function test_assigned_instructor_creates_a_lesson_in_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
        ])->assertCreated()->assertJsonPath('data.title', 'Nowa lekcja');

        $this->assertSame(1, Lesson::where('course_id', $course->id)->count());
    }

    public function test_lesson_creation_is_forbidden_on_a_foreign_course(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Cudza lekcja',
        ])->assertStatus(403);

        $this->assertSame(0, Lesson::count());
    }

    /** Odmowa przed walidacją — patrz `test_foreign_course_update_is_forbidden_even_with_an_invalid_body`. */
    public function test_foreign_course_lesson_creation_is_forbidden_even_with_an_invalid_body(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => str_repeat('a', 300),
        ])->assertStatus(403);

        $this->assertSame(0, Lesson::count());
    }

    /** Noga obronna: własny kurs z niepoprawnym ciałem dalej dostaje 422. */
    public function test_own_course_lesson_creation_with_invalid_body_is_unprocessable(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => str_repeat('a', 300),
        ])->assertStatus(422);
    }

    public function test_assigned_instructor_updates_a_lesson_in_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);
        $lesson = $this->lesson($course, 'Stara nazwa', 1);

        $this->actingAs($instructor, 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", [
            'title' => 'Nowa nazwa',
        ])->assertOk()->assertJsonPath('data.title', 'Nowa nazwa');
    }

    public function test_assigned_instructor_deletes_a_lesson_in_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);
        $lesson = $this->lesson($course, 'Do usunięcia', 1);

        $this->actingAs($instructor, 'keycloak');

        $this->deleteJson("/api/v1/instructor/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertSoftDeleted('lessons', ['id' => $lesson->id]);
    }

    public function test_lesson_update_is_forbidden_on_a_foreign_course(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $lesson = $this->lesson($course, 'Cudza', 1);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", [
            'title' => 'Podmiana',
        ])->assertStatus(403);
    }

    public function test_assigned_instructor_uploads_a_material_to_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('notatka.pdf', '%PDF-1.4 demo'),
        ])->assertCreated();

        $this->assertSame(1, Material::where('course_id', $course->id)->count());
    }

    public function test_material_upload_is_forbidden_on_a_foreign_course(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->createWithContent('notatka.pdf', '%PDF-1.4 demo'),
        ])->assertStatus(403);

        $this->assertSame(0, Material::count());
    }

    /** Odmowa przed walidacją — patrz `test_foreign_course_update_is_forbidden_even_with_an_invalid_body`. */
    public function test_foreign_course_material_upload_is_forbidden_even_with_an_invalid_file(): void
    {
        $course = $this->course('etap-1');
        $this->assignedInstructor($course);
        $stranger = User::factory()->role('instructor')->create();

        $this->actingAs($stranger, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->create('zlosliwy.exe', 10),
        ])->assertStatus(403);

        $this->assertSame(0, Material::count());
    }

    /** Noga obronna: własny kurs z niepoprawnym plikiem dalej dostaje 422. */
    public function test_own_course_material_upload_with_invalid_file_is_unprocessable(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($instructor, 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/materials", [
            'file' => UploadedFile::fake()->create('zlosliwy.exe', 10),
        ])->assertStatus(422);
    }

    public function test_assigned_instructor_deletes_a_material_of_own_course(): void
    {
        $course = $this->course('etap-1');
        $instructor = $this->assignedInstructor($course);
        $material = Material::create([
            'course_id' => $course->id,
            'name' => 'Do usunięcia',
            'file_path' => 'materials/etap-1/plik.pdf',
            'mime' => 'application/pdf',
            'size' => 10,
        ]);

        $this->actingAs($instructor, 'keycloak');

        $this->deleteJson("/api/v1/instructor/materials/{$material->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertDatabaseMissing('materials', ['id' => $material->id]);
    }

    private function course(string $slug, array $attributes = []): Course
    {
        return Course::create($attributes + [
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function lesson(Course $course, string $title, int $sequenceOrder): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => $title,
            'sequence_order' => $sequenceOrder,
            'duration_seconds' => 0,
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
