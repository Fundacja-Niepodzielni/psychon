<?php

namespace Tests\Unit\H09;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H09\AssignmentResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * H09 kryterium 1 (★) — reguła dziedziczenia w obu ścieżkach — oraz część
 * kryterium 3 po stronie H09: po zmianie prowadzącego rozstrzygnięcia idą do
 * nowej osoby, a wcześniejsze odpowiedzi pozostają przy `answered_by` (własność
 * H17, tu tylko potwierdzenie, że resolver liczy adresata „w chwili odczytu").
 */
class AssignmentResolverTest extends TestCase
{
    use RefreshDatabase;

    private AssignmentResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new AssignmentResolver;
    }

    public function test_lesson_with_its_own_assignment_returns_that_instructor(): void
    {
        [$course, $lesson] = $this->courseWithLesson();
        $courseInstructor = User::factory()->role('instructor')->create();
        $lessonInstructor = User::factory()->role('instructor')->create();

        $this->assign($course, null, $courseInstructor);
        $this->assign($course, $lesson, $lessonInstructor);

        $this->assertSame($lessonInstructor->id, $this->resolver->forLesson($lesson)->id);
    }

    public function test_lesson_without_its_own_assignment_inherits_the_course_instructor(): void
    {
        [$course, $lesson] = $this->courseWithLesson();
        $courseInstructor = User::factory()->role('instructor')->create();

        $this->assign($course, null, $courseInstructor);

        $this->assertSame($courseInstructor->id, $this->resolver->forLesson($lesson)->id);
    }

    public function test_no_assignment_at_all_resolves_to_null(): void
    {
        [, $lesson] = $this->courseWithLesson();

        $this->assertNull($this->resolver->forLesson($lesson));
    }

    public function test_unassigned_course_assignment_is_ignored(): void
    {
        [$course, $lesson] = $this->courseWithLesson();
        $former = User::factory()->role('instructor')->create();

        $assignment = $this->assign($course, null, $former);
        $assignment->forceFill(['unassigned_at' => now()])->save();

        $this->assertNull($this->resolver->forLesson($lesson));
        $this->assertNull($this->resolver->forCourse($course));
    }

    public function test_changing_the_course_instructor_redirects_future_resolutions(): void
    {
        [$course, $lesson] = $this->courseWithLesson();
        $instructorB = User::factory()->role('instructor')->create();
        $instructorC = User::factory()->role('instructor')->create();

        $assignmentB = $this->assign($course, null, $instructorB);
        $this->assertSame($instructorB->id, $this->resolver->forLesson($lesson)->id);

        $assignmentB->forceFill(['unassigned_at' => now()])->save();
        $this->assign($course, null, $instructorC);

        $this->assertSame($instructorC->id, $this->resolver->forLesson($lesson)->id);
    }

    public function test_multiple_active_course_assignments_pick_the_lowest_id_deterministically(): void
    {
        [$course, $lesson] = $this->courseWithLesson();
        $first = User::factory()->role('instructor')->create();
        $second = User::factory()->role('instructor')->create();

        $this->assign($course, null, $first);
        $this->assign($course, null, $second);

        $this->assertSame($first->id, $this->resolver->forCourse($course)->id);
        $this->assertSame($first->id, $this->resolver->forLesson($lesson)->id);
    }

    /**
     * @return array{0: Course, 1: Lesson}
     */
    private function courseWithLesson(): array
    {
        $course = Course::create([
            'title' => 'Kurs testowy',
            'slug' => 'kurs-testowy-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'is_published' => true,
        ]);

        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja testowa',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);

        return [$course, $lesson];
    }

    private function assign(Course $course, ?Lesson $lesson, User $instructor): CourseAssignment
    {
        return CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => $lesson?->id,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
    }
}
