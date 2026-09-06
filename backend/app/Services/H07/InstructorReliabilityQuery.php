<?php

namespace App\Services\H07;

use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Support\Settings;
use Illuminate\Support\Collection;

final class InstructorReliabilityQuery
{
    public function __construct(private readonly ReliabilityPresenter $presenter) {}

    /** @return Collection<int, array<string, mixed>> */
    public function for(User $instructor): Collection
    {
        return SupervisorAssignment::query()
            ->where('supervisor_id', $instructor->id)
            ->whereNull('unassigned_at')
            ->whereHas('volunteer', fn ($query) => $query
                ->where('edition_id', Settings::activeEdition()->id)
                ->whereIn('role', ['volunteer', 'student'])
                ->where('status', 'active'))
            ->with('volunteer')
            ->get()
            ->map(fn (SupervisorAssignment $assignment): array => $this->presenter
                ->instructorSummary($assignment->volunteer))
            ->sort(function (array $left, array $right): int {
                $leftPercent = $left['reliability_percent'];
                $rightPercent = $right['reliability_percent'];

                if ($leftPercent === null || $rightPercent === null) {
                    if ($leftPercent !== $rightPercent) {
                        return $leftPercent === null ? 1 : -1;
                    }
                } elseif ($leftPercent !== $rightPercent) {
                    return $leftPercent <=> $rightPercent;
                }

                return [mb_strtolower($left['last_name']), mb_strtolower($left['first_name']), $left['id']]
                    <=> [mb_strtolower($right['last_name']), mb_strtolower($right['first_name']), $right['id']];
            })
            ->values();
    }
}
