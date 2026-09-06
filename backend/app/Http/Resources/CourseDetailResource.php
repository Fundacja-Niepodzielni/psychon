<?php

namespace App\Http\Resources;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Material;
use App\Models\User;
use App\Queries\CourseCatalogQuery;
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

        return [
            ...parent::toArray($request),
            'instructor' => $this->instructor(),
            'lessons' => $lessons->map(fn (Lesson $lesson): LessonSummaryResource => new LessonSummaryResource(
                $lesson,
                in_array($lesson->id, $completedLessonIds, true),
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
        if (! CourseCatalogQuery::isParticipant($user)) {
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
