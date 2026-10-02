<?php

namespace App\Http\Resources;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Material;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use App\Services\Lessons\LessonCompletionRule;
use App\Services\Lessons\LessonSequence;
use App\Support\CourseAccess;
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
        $progress = $this->progressByLesson($user, $lessons);
        $appliesToCaller = LessonSequence::appliesTo(app(TokenRoles::class)->current());
        // Rola z tokena (nie users.role): ukończenie liczy się tylko uczestnikowi.
        $completedLessonIds = $appliesToCaller
            ? $progress->filter(fn (LessonProgress $row): bool => (bool) $row->is_completed)->keys()->map(fn ($id): int => (int) $id)->all()
            : [];
        // Ta sama reguła co odmowy tras lekcji; dla personelu nic nie jest zamknięte.
        $blockers = $appliesToCaller ? LessonSequence::blockers($lessons, $completedLessonIds) : [];
        // Próg edycji czytany raz i tylko wtedy, gdy jakaś lekcja ma co mierzyć
        // (kurs z samymi lekcjami bez nagrania nie wymaga aktywnej edycji).
        $percent = $lessons->contains(fn (Lesson $lesson): bool => LessonCompletionRule::isMeasurable($lesson))
            ? LessonCompletionRule::completionPercent()
            : null;

        return [
            ...parent::toArray($request),
            'instructor' => $this->instructor(),
            // Czy kurs ma test (relacja jest już wczytana przez kontroler);
            // kurs bez testu ma warunek testu spełniony z definicji.
            'has_test' => $this->test !== null,
            // Test kursu zamknięty do ukończenia wszystkich lekcji (kurs bez testu
            // albo bez lekcji: `false`; personel: `false`).
            'test_locked' => $appliesToCaller && LessonSequence::testLocked($this->test !== null, $lessons, $completedLessonIds),
            // Test zaliczony — to samo źródło co rozstrzygnięcie `CourseAccess`;
            // kurs bez testu: `false`.
            'test_passed' => $this->test !== null && CourseAccess::testPassed($user, $this->resource),
            'topics' => $this->topics(),
            'lessons' => $lessons->map(fn (Lesson $lesson): LessonSummaryResource => new LessonSummaryResource(
                $lesson,
                in_array($lesson->id, $completedLessonIds, true),
                isset($blockers[$lesson->id]),
                (int) $progress->get($lesson->id)?->active_seconds,
                LessonCompletionRule::requiredActiveSeconds($lesson, $percent),
                ! LessonCompletionRule::hasNoRecording($lesson),
            )),
            'materials' => MaterialResource::collection($this->materials($lessons, array_keys($blockers))),
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
     * Materials of the course AND of the lessons that are not closed for the
     * caller in one array: H08b uploads with lesson_id, and the contract has no
     * `materials` field on a lesson. A closed lesson (`$closedLessonIds`, the same
     * blockers as `lessons[].locked`) contributes no material.
     *
     * @param  Collection<int, Lesson>  $lessons
     * @param  list<int>  $closedLessonIds
     * @return Collection<int, Material>
     */
    private function materials(Collection $lessons, array $closedLessonIds): Collection
    {
        $lessonIds = $lessons->pluck('id')->reject(fn ($id): bool => in_array($id, $closedLessonIds, true))->values()->all();
        $courseId = $this->id;

        return Material::query()
            ->where(fn (Builder $query): Builder => $query
                ->where('course_id', $courseId)
                ->orWhereIn('lesson_id', $lessonIds))
            ->orderBy('id')
            ->get();
    }

    /**
     * Postęp osoby w lekcjach kursu (jedno zapytanie): czas aktywny dla każdej
     * roli; ukończenie czyta z niego wyłącznie uczestnik.
     *
     * @param  Collection<int, Lesson>  $lessons
     * @return Collection<int, LessonProgress>
     */
    private function progressByLesson(User $user, Collection $lessons): Collection
    {
        return LessonProgress::query()
            ->where('user_id', $user->id)
            ->whereIn('lesson_id', $lessons->pluck('id'))
            ->get(['lesson_id', 'active_seconds', 'is_completed'])
            ->keyBy('lesson_id');
    }
}
