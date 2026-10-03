<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Test;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Publikacja kursu odmawia, gdy test końcowy nie ma pytań i gdy kurs nie ma
 * miejsca w Programie PsychON. Obie reguły dotyczą rodzaju `course`; webinar
 * ich nie podlega. Lekcje sprawdzane są wcześniej (`CoursePublicationGapsTest`).
 */
class CoursePublicationProgramRulesTest extends TestCase
{
    use RefreshDatabase;

    private const string EMPTY_TEST = 'Test końcowy nie ma pytań. Dodaj pytania albo usuń test.';

    private const string OUTSIDE_PROGRAM = 'Kurs nie ma miejsca w Programie PsychON. Dodaj go do programu przed publikacją.';

    public function test_a_course_whose_final_test_has_no_questions_is_not_published(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => 1]);
        $this->finalTest($course, questions: 0);
        $this->actingAsAdmin();

        $this->patchJson($this->url($course), ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.message', self::EMPTY_TEST)
            ->assertJsonPath('error.reason.missing', ['final_test_without_questions'])
            ->assertJsonPath('error.reason.items', [['code' => 'final_test_without_questions', 'lesson_id' => null]]);

        $this->assertFalse($course->fresh()->is_published);
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'course.updated')->count());
    }

    public function test_a_course_whose_final_test_has_questions_is_published(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => 1]);
        $this->finalTest($course, questions: 2);
        $this->actingAsAdmin();

        $this->patchJson($this->url($course), ['is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.is_published', true);

        $this->assertTrue($course->fresh()->is_published);
    }

    public function test_a_course_without_a_final_test_is_published(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => 1]);
        $this->actingAsAdmin();

        $this->patchJson($this->url($course), ['is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.is_published', true);
    }

    public function test_a_course_outside_the_program_is_not_published(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => null]);
        $this->finalTest($course, questions: 2);
        $this->actingAsAdmin();

        $this->patchJson($this->url($course), ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.message', self::OUTSIDE_PROGRAM)
            ->assertJsonPath('error.reason.missing', ['course_outside_program'])
            ->assertJsonPath('error.reason.items', [['code' => 'course_outside_program', 'lesson_id' => null]]);

        $this->assertFalse($course->fresh()->is_published);
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'course.updated')->count());
    }

    public function test_a_place_in_the_program_given_in_the_same_request_lets_the_course_publish(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => null]);
        $this->actingAsAdmin();

        $this->patchJson($this->url($course), ['sequence_order' => 3, 'is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.sequence_order', 3)
            ->assertJsonPath('data.is_published', true);
    }

    public function test_lessons_are_reported_first_then_the_empty_test_then_the_place_in_the_program(): void
    {
        $this->actingAsAdmin();

        $withoutLessons = $this->course(['sequence_order' => null]);
        $this->finalTest($withoutLessons, questions: 0);
        $this->patchJson($this->url($withoutLessons), ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.message', 'Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.');

        $withLesson = $this->courseWithLesson(['sequence_order' => null]);
        $this->finalTest($withLesson, questions: 0);
        $this->patchJson($this->url($withLesson), ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.message', self::EMPTY_TEST);
    }

    public function test_a_webinar_is_published_outside_the_program_and_with_an_empty_test(): void
    {
        $webinar = $this->courseWithLesson(['type' => 'webinar', 'sequence_order' => null]);
        $this->finalTest($webinar, questions: 0);
        $this->actingAsAdmin();

        $this->patchJson($this->url($webinar), ['is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.is_published', true);
    }

    public function test_an_empty_final_test_is_a_blocking_gap_of_the_course(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => 1]);
        $this->finalTest($course, questions: 0);
        $this->actingAsAdmin();

        $this->getJson($this->url($course))
            ->assertOk()
            ->assertJsonPath('data.publication_gaps', [
                'blocking' => [['code' => 'final_test_without_questions', 'lesson_id' => null]],
                'waiting' => [],
            ]);
    }

    public function test_a_missing_place_in_the_program_is_a_blocking_gap_of_the_course(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => null]);
        $this->actingAsAdmin();

        $this->getJson($this->url($course))
            ->assertOk()
            ->assertJsonPath('data.publication_gaps', [
                'blocking' => [['code' => 'course_outside_program', 'lesson_id' => null]],
                'waiting' => [],
            ]);
    }

    public function test_publication_refuses_with_exactly_the_blocking_gaps_of_the_course(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => null]);
        $this->finalTest($course, questions: 0);
        $this->actingAsAdmin();

        $blocking = $this->getJson($this->url($course))->assertOk()->json('data.publication_gaps.blocking');

        $this->assertSame([
            ['code' => 'final_test_without_questions', 'lesson_id' => null],
            ['code' => 'course_outside_program', 'lesson_id' => null],
        ], $blocking);

        $this->patchJson($this->url($course), ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.message', self::EMPTY_TEST)
            ->assertJsonPath('error.reason.missing', ['final_test_without_questions', 'course_outside_program'])
            ->assertJsonPath('error.reason.items', $blocking);

        $this->assertFalse($course->fresh()->is_published);
    }

    public function test_an_empty_final_test_of_another_course_does_not_hold_this_course_back(): void
    {
        $other = $this->courseWithLesson(['sequence_order' => 2]);
        $this->finalTest($other, questions: 0);

        $course = $this->courseWithLesson(['sequence_order' => 1]);
        $this->finalTest($course, questions: 1);
        $this->actingAsAdmin();

        $this->getJson($this->url($course))
            ->assertOk()
            ->assertJsonPath('data.publication_gaps.blocking', []);

        $this->patchJson($this->url($course), ['is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.is_published', true);

        $this->getJson($this->url($other))
            ->assertOk()
            ->assertJsonPath('data.publication_gaps.blocking', [['code' => 'final_test_without_questions', 'lesson_id' => null]]);
    }

    public function test_a_webinar_has_no_gaps_for_the_final_test_or_the_program(): void
    {
        $webinar = $this->courseWithLesson(['type' => 'webinar', 'sequence_order' => null]);
        $this->finalTest($webinar, questions: 0);
        $this->actingAsAdmin();

        $this->getJson($this->url($webinar))
            ->assertOk()
            ->assertJsonPath('data.publication_gaps.blocking', []);
    }

    public function test_the_rules_guard_only_the_step_to_published(): void
    {
        $course = $this->courseWithLesson(['sequence_order' => null, 'is_published' => true]);
        $this->finalTest($course, questions: 0);
        $this->actingAsAdmin();

        $this->patchJson($this->url($course), ['title' => 'Nowy tytuł', 'is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.title', 'Nowy tytuł')
            ->assertJsonPath('data.is_published', true);
    }

    private function url(Course $course): string
    {
        return "/api/v1/admin/courses/{$course->id}";
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function course(array $attributes): Course
    {
        return Course::create($attributes + [
            'title' => 'Kurs przed publikacją',
            'slug' => 'kurs-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'is_published' => false,
        ]);
    }

    /**
     * Kurs z jedną lekcją z treścią: lekcje niczego nie blokują.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function courseWithLesson(array $attributes): Course
    {
        $course = $this->course($attributes);

        Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja 1',
            'content' => 'Treść lekcji.',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);

        return $course;
    }

    private function finalTest(Course $course, int $questions): Test
    {
        $test = Test::create([
            'course_id' => $course->id,
            'pass_threshold' => null,
            'attempts_limit' => null,
            'question_count' => 10,
        ]);

        for ($number = 1; $number <= $questions; $number++) {
            $test->questions()->create([
                'body' => "Pytanie {$number}: która odpowiedź jest zgodna z materiałem lekcji?",
                'sequence_order' => $number,
            ]);
        }

        return $test;
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        return $admin;
    }
}
