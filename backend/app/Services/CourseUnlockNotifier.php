<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Notification;
use App\Models\User;
use App\Support\Notify;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * H05 · announces a newly opened stage of the path exactly once.
 *
 * The marker lives in the notifications table, so a naive „announce everything
 * that is not locked" would fire once per already-open stage the first time a
 * seeded account opens the catalogue — nine notifications for a graduate.
 * A stage is therefore announced only when all four conditions hold at once.
 */
final class CourseUnlockNotifier
{
    private const string TYPE = 'course.unlocked';

    /**
     * @param  Collection<int, array{course: Course, state: array{status: string, missing: list<string>, required_course_id?: int}}>  $coursesWithState
     */
    public function announce(User $user, Collection $coursesWithState): void
    {
        $candidates = $coursesWithState
            ->filter(fn (array $entry): bool => $entry['course']->sequence_order !== null
                && $entry['course']->sequence_order > 1
                && $entry['state']['status'] !== 'locked')
            ->map(fn (array $entry): Course => $entry['course'])
            ->values();

        if ($candidates->isEmpty()) {
            return;
        }

        // Batch query 1 of 2: a stage the user has already started is not
        // „newly opened" — it must never be announced retroactively.
        $startedCourseIds = Lesson::query()
            ->whereIn('course_id', $candidates->pluck('id'))
            ->whereHas('progress', fn (Builder $progress): Builder => $progress->where('user_id', $user->id))
            ->distinct()
            ->pluck('course_id');

        $candidates = $candidates->reject(
            fn (Course $course): bool => $startedCourseIds->contains($course->id),
        );

        if ($candidates->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($user, $candidates): void {
            // Check-then-insert without a unique index on notifications: two
            // concurrent GET /courses would both pass the check and both send.
            // FOR UPDATE over the user's notifications locks no rows while that
            // set is still empty, so the user row carries the mutex; Postgres
            // forbids FOR UPDATE with aggregates, hence the plain pluck.
            User::query()->whereKey($user->id)->lockForUpdate()->first();

            // Batch query 2 of 2. No FOR UPDATE here: the user row above is the
            // mutex, and locking these rows too would reach into a table H16
            // writes to on every „mark as read" without adding a guarantee.
            $announced = Notification::query()
                ->where('user_id', $user->id)
                ->where('type', self::TYPE)
                ->pluck('link');

            foreach ($candidates as $course) {
                $link = "/panel/kursy/{$course->slug}";

                if ($announced->contains($link)) {
                    continue;
                }

                Notify::send(
                    $user,
                    self::TYPE,
                    "Odblokowano etap {$course->sequence_order}: {$course->title}",
                    'Poprzedni etap ścieżki jest ukończony — możesz przejść dalej.',
                    link: $link,
                );
            }
        });
    }
}
