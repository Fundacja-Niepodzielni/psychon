<?php

namespace App\Services\H17;

use App\Models\CourseAssignment;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H09\AssignmentResolver;
use Illuminate\Database\Eloquent\Builder;

/**
 * Question routing for H17 (package card: „routing wg reguły dziedziczenia H09").
 *
 * The inheritance rule itself belongs to H09, which exposes it as
 * `App\Services\H09\AssignmentResolver::forLesson()` (handshake K8 in
 * DEMO/H9-prep-doc.md). H09 has merged, so this class now consumes that rule
 * directly; the local fallback copy is gone, as its own note instructed.
 *
 * The addressee is resolved at read time. `instructor_questions` deliberately has
 * no `instructor_id` column, which is what makes „a new instructor inherits the
 * unanswered questions, answered ones stay with whoever answered" fall out of the
 * data instead of needing a second rule.
 */
final class QuestionRouting
{
    /**
     * The instructor a question about this lesson is addressed to right now,
     * or null when neither the lesson nor its course has an active assignment.
     */
    public static function forLesson(Lesson $lesson): ?User
    {
        // H09 exposes the rule as an instance method, alongside forCourse().
        return (new AssignmentResolver)->forLesson($lesson);
    }

    /**
     * Questions visible in this instructor's inbox: everything currently routed
     * to them, plus everything they answered themselves. The second term matters
     * — without it, closing an assignment would erase the instructor's own
     * answer history.
     */
    public static function scopeFor(User $instructor): Builder
    {
        $lessonIds = self::lessonIdsFor($instructor);

        return InstructorQuestion::query()->where(
            fn (Builder $query): Builder => $query
                ->whereIn('lesson_id', $lessonIds)
                ->orWhere('answered_by', $instructor->id),
        );
    }

    /**
     * Lesson ids whose questions are addressed to this instructor right now.
     *
     * @return array<int, int>
     */
    public static function lessonIdsFor(User $instructor): array
    {
        $activeAssignments = CourseAssignment::query()->whereNull('unassigned_at');

        // Lesson-level assignments always win over the course-level one.
        $ownLessonIds = (clone $activeAssignments)
            ->where('instructor_id', $instructor->id)
            ->whereNotNull('lesson_id')
            ->pluck('lesson_id');

        $ownCourseIds = (clone $activeAssignments)
            ->where('instructor_id', $instructor->id)
            ->whereNull('lesson_id')
            ->pluck('course_id');

        // …so a lesson someone else holds directly is excluded from the course-level
        // inheritance, even when this instructor runs the course.
        $lessonsHeldDirectly = (clone $activeAssignments)
            ->whereNotNull('lesson_id')
            ->pluck('lesson_id');

        $inheritedLessonIds = Lesson::query()
            ->whereIn('course_id', $ownCourseIds)
            ->whereNotIn('id', $lessonsHeldDirectly)
            ->pluck('id');

        return $ownLessonIds
            ->merge($inheritedLessonIds)
            ->map(fn ($id): int => (int) $id)
            ->unique()
            ->values()
            ->all();
    }
}
