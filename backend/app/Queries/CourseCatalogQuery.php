<?php

namespace App\Queries;

use App\Models\Course;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use Illuminate\Database\Eloquent\Builder;

/**
 * Course visibility per the role matrix (docs/system/03-role-i-uprawnienia.md §2,
 * row „Kursy: przeglądanie i nauka"). Narrowing happens in SQL — a resource the
 * caller cannot see must never be loaded, so that GET /courses/{slug} can answer
 * 404 without revealing its existence (contract §1.1).
 *
 * R2 (sprint-2 §1): the caller decides by the CURRENT REQUEST'S token roles
 * (`App\Services\Auth\TokenRoles::current()`), passed in as `$roles` — the
 * `users` table's own local column is never consulted here. A user may hold
 * several roles at once, so branches below are checked by membership, in the
 * same priority order the previous single-value switch used to encode (most
 * restrictive first).
 *
 * This is package-owned code: app/Support/ holds the staff-owned starter facades.
 *
 * @see TokenRoles
 */
final class CourseCatalogQuery
{
    /**
     * @param  list<string>  $roles  Local role names from the CALLER's token
     *                               (`TokenRoles::current()`) — never a column
     *                               read straight off the `$user` record.
     */
    public static function visibleTo(User $user, array $roles): Builder
    {
        $query = Course::query()->where('is_published', true);

        if (in_array('student', $roles, true)) {
            $query->whereNull('sequence_order'); // invited courses / webinars
        } elseif (in_array('volunteer', $roles, true)) {
            $query->whereNotNull('sequence_order'); // the training path
        } elseif (in_array('instructor', $roles, true)) {
            $query->whereHas('assignments', fn (Builder $assignments): Builder => $assignments
                ->where('instructor_id', $user->id)
                ->whereNull('unassigned_at'));
        } elseif (array_intersect(['project_manager', 'super_admin'], $roles) !== []) {
            // no extra narrowing — staff sees the whole catalogue
        } else {
            $query->whereRaw('1 = 0');
        }

        // A user assigned to both product groups is narrowed by nothing;
        // anyone else sees their own group plus the shared „both" courses.
        if ($user->product_group !== null && $user->product_group !== 'both') {
            $query->whereIn('product_group', [$user->product_group, 'both']);
        }

        return $query;
    }

    /**
     * Participants are the roles the sequential unlock rule was written for.
     *
     * @param  list<string>  $roles  Local role names from the CALLER's token.
     */
    public static function isParticipant(array $roles): bool
    {
        return array_intersect($roles, ['volunteer', 'student']) !== [];
    }
}
