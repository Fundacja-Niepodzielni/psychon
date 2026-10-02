<?php

namespace App\Http\Resources;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Material;
use App\Models\User;
use App\Queries\CourseCatalogQuery;
use App\Services\Auth\TokenRoles;
use App\Services\Lessons\LessonSequence;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Single course — contract §2 „Kursy (H05)", GET /courses/{slug}:
 * the list fields plus instructor, lessons and materials.
 *
 * @mixin Course
 */
class CourseDetailResource extends CourseListResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $lessons = $this->lessons;
        $completedLessonIds = $this->completedLessonIds($user, $lessons);
        $appliesToCaller = LessonSequence::appliesTo(app(TokenRoles::class)->current());
        // Ta sama reguła co odmowy tras lekcji; dla personelu nic nie jest zamknięte.
        $blockers = $appliesToCaller ? LessonSequence::blockers($lessons, $completedLessonIds) : [];

        return [
            ...parent::toArray($request),
            'instructor' => $this->instructor(),
            // Czy kurs ma test (relacja jest już wczytana przez kontroler);
            // kurs bez testu ma warunek testu spełniony z definicji.
            'has_test' => $this->test !== null,
            // Test kursu zamknięty do ukończenia wszystkich lekcji (kurs bez testu
            // albo bez lekcji: `false`; personel: `false`).
            'test_locked' => $appliesToCaller && LessonSequence::testLocked($this->test !== null, $lessons, $completedLessonIds),
            'topics' => $this->topics(),
            'lessons' => $lessons->map(fn (Lesson $lesson): LessonSummaryResource => new LessonSummaryResource(
                $lesson,
                in_array($lesson->id, $completedLessonIds, true),
                isset($blockers[$lesson->id]),
            )),
            'materials' => MaterialResource::collection($this->materials($lessons)),
        ];
    }

    /**
     * @return array{id: int, name: string}|null
     */
    private function instructor(): ?array
    {
        $assignment = CourseAssignment::query()
            ->where('course_id', $this->id)
            ->whereNull('lesson_id') // course-level assignment
            ->whereNull('unassigned_at')
            ->with('instructor')
            ->orderBy('id')
            ->first();

        if ($assignment?->instructor === null) {
            return null;
        }

        return [
            'id' => $assignment->instructor->id,
            'name' => $assignment->instructor->fullName(),
        ];
    }

    /**
     * Topics of the course in order; each lesson carries its `topic_id`, so
     * the flat `lessons` list stays as it was and can be grouped client-side.
     *
     * @return list<array{id: int, title: string, position: int}>
     */
    private function topics(): array
    {
        return $this->resource->topics()
            ->get(['id', 'title', 'position'])
            ->map(fn (CourseTopic $topic): array => [
                'id' => $topic->id,
                'title' => $topic->title,
                'position' => $topic->position,
            ])
            ->values()
            ->all();
    }

    /**
     * Materials of the course AND of all its lessons in one array: H08b uploads
     * with lesson_id, and the contract has no `materials` field on a lesson.
     *
     * @param  Collection<int, Lesson>  $lessons
     * @return Collection<int, Material>
     */
    private function materials(Collection $lessons): Collection
    {
        $lessonIds = $lessons->pluck('id')->all();
        $courseId = $this->id;

        return Material::query()
            ->where(fn (Builder $query): Builder => $query
                ->where('course_id', $courseId)
                ->orWhereIn('lesson_id', $lessonIds))
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  Collection<int, Lesson>  $lessons
     * @return list<int>
     */
    private function completedLessonIds(User $user, Collection $lessons): array
    {
        // R2 (sprint-2 §1): the CALLER's token roles, never `$user->role`.
        if (! CourseCatalogQuery::isParticipant(app(TokenRoles::class)->current())) {
            return [];
        }

        return LessonProgress::query()
            ->where('user_id', $user->id)
            ->whereIn('lesson_id', $lessons->pluck('id'))
            ->where('is_completed', true)
            ->pluck('lesson_id')
            ->all();
    }
}
