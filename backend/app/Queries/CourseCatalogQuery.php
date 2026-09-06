<?php

namespace App\Queries;

use App\Models\Course;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Course visibility per the role matrix (docs/system/03-role-i-uprawnienia.md §2,
 * row „Kursy: przeglądanie i nauka"). Narrowing happens in SQL — a resource the
 * caller cannot see must never be loaded, so that GET /courses/{slug} can answer
 * 404 without revealing its existence (contract §1.1).
 *
 * This is package-owned code: app/Support/ holds the staff-owned starter facades.
 */
final class CourseCatalogQuery
{
    public static function visibleTo(User $user): Builder
    {
        $query = Course::query()->where('is_published', true);

        switch ($user->role) {
            case 'student':
                $query->whereNull('sequence_order'); // invited courses / webinars
                break;

            case 'volunteer':
                $query->whereNotNull('sequence_order'); // the training path
                break;

            case 'instructor':
                $query->whereHas('assignments', fn (Builder $assignments): Builder => $assignments
                    ->where('instructor_id', $user->id)
                    ->whereNull('unassigned_at'));
                break;

            case 'project_manager':
            case 'super_admin':
                break;

            default:
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
     */
    public static function isParticipant(User $user): bool
    {
        return in_array($user->role, ['volunteer', 'student'], true);
    }
}
