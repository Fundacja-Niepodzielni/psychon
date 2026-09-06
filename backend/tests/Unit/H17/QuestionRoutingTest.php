<?php

namespace Tests\Unit\H17;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H17\QuestionRouting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * H17 acceptance criterion 1 ★ — the inheritance rule, both branches.
 */
class QuestionRoutingTest extends TestCase
{
    use RefreshDatabase;

    public function test_lesson_level_assignment_wins_over_the_course_level_one(): void
    {
        $courseInstructor = $this->instructor();
        $lessonInstructor = $this->instructor();
        $course = $this->course();
        $lesson = $this->lesson($course);

        $this->assign($course, $courseInstructor);
        $this->assign($course, $lessonInstructor, $lesson);

        $this->assertSame($lessonInstructor->id, QuestionRouting::forLesson($lesson)->id);
    }

    public function test_lesson_without_its_own_assignment_inherits_the_course_instructor(): void
    {
        $courseInstructor = $this->instructor();
        $course = $this->course();
        $lesson = $this->lesson($course);

        $this->assign($course, $courseInstructor);

        $this->assertSame($courseInstructor->id, QuestionRouting::forLesson($lesson)->id);
    }

    public function test_lesson_without_any_active_assignment_has_no_addressee(): void
    {
        $course = $this->course();
        $lesson = $this->lesson($course);

        $this->assign($course, $this->instructor(), unassigned: true);

        $this->assertNull(QuestionRouting::forLesson($lesson));
    }

    public function test_inbox_excludes_lessons_held_directly_by_someone_else(): void
    {
        $courseInstructor = $this->instructor();
        $lessonInstructor = $this->instructor();
        $course = $this->course();
        $inherited = $this->lesson($course, 1);
        $heldDirectly = $this->lesson($course, 2);

        $this->assign($course, $courseInstructor);
        $this->assign($course, $lessonInstructor, $heldDirectly);

        $this->assertSame([$inherited->id], QuestionRouting::lessonIdsFor($courseInstructor));
        $this->assertSame([$heldDirectly->id], QuestionRouting::lessonIdsFor($lessonInstructor));
    }

    public function test_closing_an_assignment_moves_unanswered_questions_and_keeps_answered_ones(): void
    {
        $first = $this->instructor();
        $second = $this->instructor();
        $asker = User::factory()->create(['role' => 'volunteer']);
        $course = $this->course();
        $lesson = $this->lesson($course);

        $assignment = $this->assign($course, $first);
        $answered = InstructorQuestion::create([
            'user_id' => $asker->id,
            'lesson_id' => $lesson->id,
            'question' => 'Pytanie odpowiedziane.',
            'answer' => 'Odpowiedź.',
            'answered_by' => $first->id,
            'answered_at' => now(),
        ]);
        $pending = InstructorQuestion::create([
            'user_id' => $asker->id,
            'lesson_id' => $lesson->id,
            'question' => 'Pytanie nieodpowiedziane.',
        ]);

        $assignment->update(['unassigned_at' => now()]);
        $this->assign($course, $second);

        // A keeps their own answer even though the assignment is closed…
        $this->assertSame(
            [$answered->id],
            QuestionRouting::scopeFor($first)->pluck('id')->all(),
        );
        $this->assertSame($first->id, $answered->refresh()->answered_by);

        // …and the unanswered one — only that one — lands on B's desk.
        $this->assertSame(
            [$pending->id],
            QuestionRouting::scopeFor($second)->whereNull('answered_at')->pluck('id')->all(),
        );
    }

    private function instructor(): User
    {
        return User::factory()->create(['role' => 'instructor']);
    }

    private function course(): Course
    {
        return Course::create([
            'title' => 'Kurs testowy',
            'slug' => 'kurs-testowy-'.uniqid(),
            'sequence_order' => 1,
            'is_published' => true,
        ]);
    }

    private function lesson(Course $course, int $order = 1): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => "Lekcja {$order}",
            'sequence_order' => $order,
            'duration_seconds' => 600,
        ]);
    }

    private function assign(
        Course $course,
        User $instructor,
        ?Lesson $lesson = null,
        bool $unassigned = false,
    ): CourseAssignment {
        return CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => $lesson?->id,
            'instructor_id' => $instructor->id,
            'assigned_at' => now()->subDay(),
            'unassigned_at' => $unassigned ? now() : null,
        ]);
    }
}
