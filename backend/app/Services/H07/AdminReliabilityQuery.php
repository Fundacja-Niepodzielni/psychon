<?php

namespace App\Services\H07;

use App\Models\User;
use App\Support\Settings;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

final class AdminReliabilityQuery
{
    public function __construct(private readonly ReliabilityPresenter $presenter) {}

    /** @return LengthAwarePaginator<int, array<string, mixed>> */
    public function paginate(int $page, int $perPage): LengthAwarePaginator
    {
        $rows = $this->sort(
            $this->participants()
                ->map(fn (User $user): array => $this->presenter->adminSummary($user)),
        );

        return new LengthAwarePaginator(
            $rows->forPage($page, $perPage)->values(),
            $rows->count(),
            $perPage,
            $page,
        );
    }

    /** @return Collection<int, User> */
    private function participants(): Collection
    {
        return User::query()
            ->where('edition_id', Settings::activeEdition()->id)
            ->whereIn('role', ['volunteer', 'student'])
            ->where('status', 'active')
            ->get();
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    private function sort(Collection $rows): Collection
    {
        return $rows->sort(function (array $left, array $right): int {
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
        })->values();
    }
}
