<?php

namespace Tests\Feature\H18;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `path_tests_passed` / `path_tests_total` (ProgressAggregator::for()).
 *
 * Umowa pod probą: `path_tests_total` liczy WYLACZNIE kursy sciezki (sequence_order
 * niepuste, type=course, is_published=true), ktore MAJA test — kurs sciezki bez testu
 * NIE wchodzi do mianownika, mimo ze `CourseAccess::testPassed()` uznaje go za zdany z
 * definicji (inaczej ten sam fakt zawyzalby `path_tests_passed` ponad realnie zdane
 * testy). `path_tests_passed` liczy z tego SAMEGO zawezonego zbioru, ilu kursow test ma
 * co najmniej jedno podejscie z `passed=true`.
 */
class PathTestsCounterTest extends TestCase
{
    use RefreshDatabase;

    private function edition(): Edition
    {
        return Edition::create([
            'name' => 'Edycja licznika testow sciezki',
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
     * Kurs sciezki (sequence_order = $order) w edycji, opcjonalnie z jednopytaniowym
     * testem. Publikowany, typu 'course' — wpisuje sie w licznik `courses_total`
     * i, gdy ma test, w mianownik `path_tests_total`.
     */
    private function pathCourse(Edition $edition, int $order, bool $withTest): Course
    {
        $course = Course::create([
            'title' => "Kurs sciezki {$order}",
            'slug' => 'kurs-licznika-sciezki-'.$order.'-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $edition->id,
            'is_published' => true,
        ]);

        if ($withTest) {
            $course->test()->create([
                'pass_threshold' => null,
                'attempts_limit' => null,
                'question_count' => 1,
            ]);
        }

        return $course->fresh();
    }

    private function attempt(User $user, Test $test, bool $passed, int $attemptNumber = 1): TestAttempt
    {
        return TestAttempt::create([
            'user_id' => $user->id,
            'test_id' => $test->id,
            'attempt_number' => $attemptNumber,
            'answers' => [],
            'questions_snapshot' => [],
            'score_percent' => $passed ? 100 : 0,
            'passed' => $passed,
        ]);
    }

    public function test_fraction_matches_one_passed_of_three_courses_with_a_test(): void
    {
        $edition = $this->edition();
        $user = User::factory()->create(['role' => 'volunteer']);

        $course1 = $this->pathCourse($edition, 1, withTest: true);
        $this->pathCourse($edition, 2, withTest: true);
        $this->pathCourse($edition, 3, withTest: true);

        $this->attempt($user, $course1->test, passed: true);

        $progress = ProgressAggregator::for($user);

        $this->assertSame(1, $progress['path_tests_passed']);
        $this->assertSame(3, $progress['path_tests_total']);
    }

    public function test_a_failed_attempt_does_not_move_the_numerator(): void
    {
        $edition = $this->edition();
        $user = User::factory()->create(['role' => 'volunteer']);

        $course1 = $this->pathCourse($edition, 1, withTest: true);
        $course2 = $this->pathCourse($edition, 2, withTest: true);
        $this->pathCourse($edition, 3, withTest: true);

        $this->attempt($user, $course1->test, passed: true);
        $this->attempt($user, $course2->test, passed: false);

        $progress = ProgressAggregator::for($user);

        // Noga negatywna: podejscie niezaliczone NIE podnosi licznika — zostaje na 1,
        // dokladnie tak jak przed nim (leg 1), nie rosnie do 2.
        $this->assertSame(1, $progress['path_tests_passed']);
        $this->assertSame(3, $progress['path_tests_total']);
    }

    public function test_a_course_without_a_test_is_excluded_from_the_denominator(): void
    {
        $edition = $this->edition();
        $user = User::factory()->create(['role' => 'volunteer']);

        $course1 = $this->pathCourse($edition, 1, withTest: true);
        $this->pathCourse($edition, 2, withTest: true);
        $this->pathCourse($edition, 3, withTest: true);
        // Czwarty kurs sciezki, BEZ testu — nie wchodzi do mianownika, mimo ze wchodziłby
        // do `courses_total`.
        $this->pathCourse($edition, 4, withTest: false);

        $this->attempt($user, $course1->test, passed: true);

        $progress = ProgressAggregator::for($user);

        $this->assertSame(1, $progress['path_tests_passed']);
        $this->assertSame(3, $progress['path_tests_total']);
        $this->assertSame(4, $progress['courses_total']);
    }
}
