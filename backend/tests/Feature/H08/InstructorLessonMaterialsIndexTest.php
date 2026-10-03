<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * `GET /api/v1/instructor/lessons/{lesson}/materials` — lista materiałów lekcji
 * dla prowadzącego przypisanego do kursu (ta sama reguła przypisania co
 * wgrywanie, `CoursePolicy::update`) w tym samym kształcie co
 * `GET /api/v1/admin/lessons/{lesson}/materials`. Lekcja kursu bez
 * przypisania odpowiada tak samo jak lekcja, której nie ma. Wiersze
 * materiałów są wstawiane wprost, bez plików na dysku.
 */
class InstructorLessonMaterialsIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_instructor_reads_the_list_in_the_shape_of_the_administration_list(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);
        $other = $this->lesson($course, 2);

        $first = $this->material(['lesson_id' => $lesson->id, 'name' => 'Karta pracy.pdf', 'created_at' => '2026-10-01 10:00:00']);
        $second = $this->material(['lesson_id' => $lesson->id, 'name' => 'Notatki.txt', 'mime' => 'text/plain', 'created_at' => '2026-10-01 11:00:00']);
        $this->material(['lesson_id' => $other->id, 'name' => 'Innej lekcji']);
        $this->material(['course_id' => $course->id, 'name' => 'Całego kursu']);

        $this->actingAs($this->assignedInstructor($course), 'keycloak');
        $forInstructor = $this->getJson($this->url($lesson->id))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->json();

        $this->assertSame([$first, $second], array_column($forInstructor['data'], 'id'));
        $this->assertSame(['Karta pracy.pdf', 'Notatki.txt'], array_column($forInstructor['data'], 'name'));
        $this->assertSame(
            ['course_id', 'created_at', 'id', 'lesson_id', 'mime', 'name', 'size'],
            $this->sortedKeys($forInstructor['data'][0]),
        );

        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $forAdmin = $this->getJson("/api/v1/admin/lessons/{$lesson->id}/materials")->assertOk()->json();

        $this->assertSame($forAdmin, $forInstructor, 'Prowadzący i administracja dostają tę samą listę.');
    }

    public function test_assigned_instructor_gets_an_empty_list_for_a_lesson_without_materials(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);

        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->getJson($this->url($lesson->id))
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_a_lesson_of_a_course_without_assignment_answers_exactly_like_a_missing_lesson(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);
        $this->material(['lesson_id' => $lesson->id]);
        $this->assignedInstructor($course);

        $this->actingAs($this->assignedInstructor($this->course('etap-2')), 'keycloak');

        $withoutAssignment = $this->getJson($this->url($lesson->id));
        $missing = $this->getJson($this->url($lesson->id + 1000));

        $this->assertSame(404, $missing->status());
        $this->assertSame($missing->status(), $withoutAssignment->status());
        $this->assertSame($missing->json(), $withoutAssignment->json());
        $this->assertSame($missing->getContent(), $withoutAssignment->getContent());
    }

    public function test_instructor_of_another_course_gets_the_answer_for_a_missing_lesson(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);
        $this->material(['lesson_id' => $lesson->id]);

        $this->assignedInstructor($course);
        $foreign = $this->assignedInstructor($this->course('etap-2'));
        $this->actingAs($foreign, 'keycloak');

        $this->assertAnswersLikeAMissingLesson($lesson);
    }

    public function test_instructor_assigned_to_one_lesson_only_gets_the_answer_for_a_missing_lesson(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);
        $instructor = User::factory()->role('instructor')->create();
        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => $lesson->id,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);

        $this->actingAs($instructor, 'keycloak');

        $this->assertAnswersLikeAMissingLesson($lesson);
    }

    public function test_instructor_unassigned_from_the_course_gets_the_answer_for_a_missing_lesson(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);
        $instructor = $this->assignedInstructor($course);
        CourseAssignment::query()->where('instructor_id', $instructor->id)->update(['unassigned_at' => now()]);

        $this->actingAs($instructor, 'keycloak');

        $this->assertAnswersLikeAMissingLesson($lesson);
    }

    public function test_unknown_soft_deleted_and_out_of_range_lessons_are_not_found(): void
    {
        $course = $this->course('etap-1');
        $deleted = $this->lesson($course, 1);
        $deleted->delete();

        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        foreach ([(string) ($deleted->id + 1000), (string) $deleted->id, '99999999999999999999'] as $segment) {
            $this->getJson("/api/v1/instructor/lessons/{$segment}/materials")
                ->assertStatus(404)
                ->assertJsonPath('error.code', 'not_found')
                ->assertJsonMissingPath('data');
        }
    }

    public function test_other_roles_are_refused_and_a_guest_is_unauthenticated(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1);

        $this->getJson($this->url($lesson->id))
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        foreach (['volunteer', 'student', 'project_manager', 'super_admin'] as $role) {
            $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

            $this->getJson($this->url($lesson->id))
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    private function url(int $lessonId): string
    {
        return "/api/v1/instructor/lessons/{$lessonId}/materials";
    }

    /**
     * Status 404 i ciało bajt w bajt jak dla lekcji, której nie ma.
     */
    private function assertAnswersLikeAMissingLesson(Lesson $lesson): void
    {
        $answer = $this->getJson($this->url($lesson->id));

        $answer->assertStatus(404)
            ->assertExactJson(['error' => ['status' => 404, 'code' => 'not_found', 'message' => 'Nie znaleziono zasobu.']]);
        $this->assertSame($this->getJson($this->url($lesson->id + 1000))->getContent(), $answer->getContent());
    }

    /**
     * @param  array<string, mixed>  $element
     * @return list<string>
     */
    private function sortedKeys(array $element): array
    {
        $keys = array_keys($element);
        sort($keys);

        return $keys;
    }

    private function course(string $slug): Course
    {
        return Course::create([
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function lesson(Course $course, int $order): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja '.$order,
            'sequence_order' => $order,
            'duration_seconds' => 600,
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

    /**
     * Wiersz wprost w tabeli, bez pliku na dysku.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function material(array $attributes): int
    {
        $attributes += ['created_at' => '2026-10-01 10:00:00'];

        return DB::table('materials')->insertGetId($attributes + [
            'name' => 'Materiał',
            'file_path' => 'materials/etap-1/plik.pdf',
            'mime' => 'application/pdf',
            'size' => 1024,
            'updated_at' => $attributes['created_at'],
        ]);
    }
}
