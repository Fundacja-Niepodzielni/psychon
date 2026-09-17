<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

/**
 * Test kursu i trasy personelu sprawdzają widoczność kursu tą samą regułą co
 * lekcja: kurs poza zasięgiem osoby odpowiada tak, jakby nie istniał, a
 * dopiero widoczny kurs podlega kolejności w ścieżce. Personel korzystający
 * z lekcji zachowuje dotychczasowy dostęp — reguła widoczności go nie dotyczy,
 * z wyjątkiem linku do nagrania.
 */
class CourseTestVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private ?Edition $edition = null;

    public function test_test_of_an_unpublished_course_is_not_found(): void
    {
        $test = $this->makeTest(['sequence_order' => 1, 'is_published' => false]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_attempt_on_an_unpublished_course_test_is_not_found_and_stores_nothing(): void
    {
        $test = $this->makeTest(['sequence_order' => 1, 'is_published' => false]);
        $otherTest = $this->makeTest(['sequence_order' => null, 'is_published' => true]);
        $this->actingAs($this->volunteer(), 'keycloak');
        $before = TestAttempt::count();

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->correctAnswers($test),
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($before, TestAttempt::count());

        $foreignAnswerId = $otherTest->questions()->first()->answers()->first()->id;
        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => [(string) $test->questions()->first()->id => $foreignAnswerId],
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($before, TestAttempt::count());
    }

    public function test_unpublished_and_order_locked_course_test_is_not_found_not_forbidden(): void
    {
        $first = $this->makeCourse(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($first);
        $test = $this->makeTest(['sequence_order' => 2, 'is_published' => false]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->correctAnswers($test),
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_test_of_a_course_from_a_different_product_group_is_not_found_for_a_student(): void
    {
        $test = $this->makeTest([
            'sequence_order' => null,
            'product_group' => 'dobrostan',
            'is_published' => true,
        ]);
        $student = User::factory()->create(['role' => 'student', 'product_group' => 'psychon']);
        $this->actingAs($student, 'keycloak');
        $before = TestAttempt::count();

        $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->correctAnswers($test),
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($before, TestAttempt::count());

        $foreignQuestionAnswer = $this->foreignAnswerFor($test);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $foreignQuestionAnswer,
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($before, TestAttempt::count());
    }

    public function test_visible_and_unlocked_course_test_takes_attempts_as_before(): void
    {
        $test = $this->makeTest(['sequence_order' => null, 'is_published' => true]);
        $volunteer = $this->volunteer();
        $this->actingAs($volunteer, 'keycloak');

        $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertOk()
            ->assertJsonPath('data.test_id', $test->id);

        $before = TestAttempt::count();
        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->correctAnswers($test),
        ])
            ->assertCreated()
            ->assertJsonPath('data.passed', true);
        $this->assertSame($before + 1, TestAttempt::count());

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->foreignAnswerFor($test),
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_visible_but_order_locked_course_test_is_forbidden_with_the_required_course(): void
    {
        $first = $this->makeCourse(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($first);
        $test = $this->makeTest(['sequence_order' => 2, 'is_published' => true]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->correctAnswers($test),
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);
    }

    public function test_assigned_and_unassigned_instructor_both_keep_access_to_an_unpublished_course(): void
    {
        $course = $this->makeCourse(['sequence_order' => 1, 'is_published' => false]);
        $lesson = $this->lesson($course);
        $assigned = User::factory()->create(['role' => 'instructor']);
        CourseAssignment::create([
            'course_id' => $course->id,
            'instructor_id' => $assigned->id,
            'assigned_at' => now(),
        ]);
        $unassigned = User::factory()->create(['role' => 'instructor']);

        $this->actingAs($assigned, 'keycloak');
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();
        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", [
            'watched_delta' => 10,
            'active_delta' => 10,
        ])->assertOk();

        $this->actingAs($unassigned, 'keycloak');
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();
    }

    /**
     * Prowadzący bez żadnego związku z kursem (ani grupa produktowa, ani
     * `CourseAssignment`) nie dostaje już pełnego zwolnienia z reguły
     * widoczności — kurs nieopublikowany, do którego nie jest przypisany,
     * odpowiada mu tak samo jak uczestnikowi bez dostępu: 404.
     */
    public function test_unassigned_instructor_from_a_different_group_cannot_reach_an_unpublished_course(): void
    {
        $course = $this->makeCourse([
            'sequence_order' => 1,
            'product_group' => 'dobrostan',
            'is_published' => false,
        ]);
        $lesson = $this->lesson($course);
        $stranger = User::factory()->create(['role' => 'instructor', 'product_group' => 'psychon']);
        $this->actingAs($stranger, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * Ten sam prowadzący, ten sam brak związku z kursem — tym razem kurs
     * jest opublikowany, ale spoza jego grupy produktowej i bez przypisania.
     * Wynik jest identyczny jak dla uczestnika bez dostępu: 404, nie 200.
     */
    public function test_unassigned_instructor_from_a_different_group_cannot_reach_a_published_course_outside_it(): void
    {
        $course = $this->makeCourse([
            'sequence_order' => 1,
            'product_group' => 'dobrostan',
            'is_published' => true,
        ]);
        $lesson = $this->lesson($course);
        $stranger = User::factory()->create(['role' => 'instructor', 'product_group' => 'psychon']);
        $this->actingAs($stranger, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_project_manager_and_administrator_keep_lesson_access_but_stay_bound_by_the_sequence(): void
    {
        $unpublished = $this->makeCourse(['sequence_order' => 1, 'is_published' => false]);
        $unpublishedLesson = $this->lesson($unpublished);
        $otherGroup = $this->makeCourse([
            'sequence_order' => null,
            'product_group' => 'dobrostan',
            'is_published' => true,
        ]);
        $otherGroupLesson = $this->lesson($otherGroup);
        $first = $this->makeCourse(['sequence_order' => 10, 'is_published' => true]);
        $this->lesson($first);
        $second = $this->makeCourse(['sequence_order' => 11, 'is_published' => true]);
        $lockedLesson = $this->lesson($second);

        foreach ([
            User::factory()->create(['role' => 'project_manager']),
            User::factory()->create(['role' => 'super_admin']),
        ] as $staff) {
            $this->actingAs($staff, 'keycloak');

            $this->getJson("/api/v1/lessons/{$unpublishedLesson->id}")->assertOk();
            $this->getJson("/api/v1/lessons/{$otherGroupLesson->id}")->assertOk();

            $this->getJson("/api/v1/lessons/{$lockedLesson->id}")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'course_locked')
                ->assertJsonPath('error.reason.required_course_id', $first->id);
        }
    }

    public function test_video_link_hides_a_course_outside_the_instructors_own_catalogue(): void
    {
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');

        $ownCourse = $this->makeCourse(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($ownCourse);
        $otherCourse = $this->makeCourse(['sequence_order' => null, 'is_published' => true]);
        $otherLesson = $this->lesson($otherCourse, ['video_provider_id' => 'mock-katalog']);

        $instructor = User::factory()->create(['role' => 'instructor']);
        CourseAssignment::create([
            'course_id' => $ownCourse->id,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        $this->actingAs($instructor, 'keycloak');

        $this->getJson("/api/v1/lessons/{$otherLesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_staff_asking_a_lesson_question_is_forbidden(): void
    {
        $course = $this->makeCourse(['sequence_order' => 1, 'is_published' => true]);
        $lesson = $this->lesson($course);
        $instructor = User::factory()->create(['role' => 'instructor']);
        $this->actingAs($instructor, 'keycloak');

        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Pytanie od personelu.'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_attempt_history_of_an_unpublished_course_test_is_not_found(): void
    {
        $test = $this->makeTest(['sequence_order' => 1, 'is_published' => false]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found')
            ->assertJsonPath('error.message', 'Nie znaleziono zasobu.');
    }

    public function test_attempt_history_of_a_test_from_a_different_product_group_is_not_found(): void
    {
        $test = $this->makeTest([
            'sequence_order' => null,
            'product_group' => 'dobrostan',
            'is_published' => true,
        ]);
        $student = User::factory()->create(['role' => 'student', 'product_group' => 'psychon']);
        $this->actingAs($student, 'keycloak');

        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found')
            ->assertJsonPath('error.message', 'Nie znaleziono zasobu.');
    }

    public function test_attempt_history_of_a_visible_course_lists_the_callers_own_attempts(): void
    {
        $test = $this->makeTest(['sequence_order' => null, 'is_published' => true]);
        $volunteer = $this->volunteer();
        $this->actingAs($volunteer, 'keycloak');

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->correctAnswers($test),
        ])->assertCreated();

        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.passed', true)
            ->assertJsonPath('meta.extra.attempts_used', 1)
            ->assertJsonPath('meta.extra.attempts_limit', 3)
            ->assertJsonPath('meta.extra.pass_threshold', 80);
    }

    public function test_attempt_history_of_a_visible_but_order_locked_course_stays_reachable(): void
    {
        $first = $this->makeCourse(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($first);
        $test = $this->makeTest(['sequence_order' => 2, 'is_published' => true]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_attempt_history_route_is_forbidden_for_staff(): void
    {
        $test = $this->makeTest(['sequence_order' => null, 'is_published' => true]);

        foreach ([
            User::factory()->create(['role' => 'instructor']),
            User::factory()->create(['role' => 'super_admin']),
        ] as $staff) {
            $this->actingAs($staff, 'keycloak');

            $this->getJson("/api/v1/tests/{$test->id}/attempts")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    private function edition(): Edition
    {
        return $this->edition ??= Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja testu kursu',
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

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeCourse(array $overrides = []): Course
    {
        return Course::create([
            'title' => 'Kurs testowy '.uniqid(),
            'slug' => 'kurs-testowy-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function lesson(Course $course, array $overrides = []): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja testowa',
            'sequence_order' => 1,
            'duration_seconds' => 600,
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $courseOverrides
     */
    private function makeTest(array $courseOverrides, int $questions = 3): Test
    {
        $course = $this->makeCourse($courseOverrides);

        $test = $course->test()->create([
            'pass_threshold' => null,
            'attempts_limit' => null,
            'question_count' => $questions,
        ]);

        foreach (range(1, $questions) as $n) {
            $question = $test->questions()->create([
                'body' => "Pytanie {$n}?",
                'sequence_order' => $n,
            ]);
            $question->answers()->create(['body' => 'Poprawna', 'is_correct' => true]);
            $question->answers()->create(['body' => 'Błędna', 'is_correct' => false]);
        }

        return $test->fresh(['questions.answers', 'course']);
    }

    /**
     * @return array<string, int>
     */
    private function correctAnswers(Test $test): array
    {
        $answers = [];
        foreach ($test->questions as $question) {
            $answers[(string) $question->id] = $question->answers->firstWhere('is_correct', true)->id;
        }

        return $answers;
    }

    /**
     * Zestaw odpowiedzi, w którym jedna odpowiedź należy do zupełnie innego
     * testu — powód, dla którego walidacja go odrzuca, nie ma nic wspólnego
     * z widocznością kursu.
     *
     * @return array<string, int>
     */
    private function foreignAnswerFor(Test $test): array
    {
        $foreignTest = $this->makeTest(['sequence_order' => null, 'is_published' => true], questions: 1);
        $answers = $this->correctAnswers($test);
        $firstQuestionId = (string) $test->questions->first()->id;
        $answers[$firstQuestionId] = $foreignTest->questions->first()->answers->first()->id;

        return $answers;
    }

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }
}
