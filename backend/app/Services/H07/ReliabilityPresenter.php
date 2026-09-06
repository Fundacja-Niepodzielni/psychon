<?php

namespace App\Services\H07;

use App\Models\User;
use App\Support\ProgressAggregator;
use App\Support\Settings;

final class ReliabilityPresenter
{
    /** @var array<int, int|null> */
    private array $percentages = [];

    private ?int $threshold = null;

    /** @return array<string, mixed> */
    public function adminSummary(User $user): array
    {
        return [
            'id' => (int) $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            ...$this->measurement($user),
        ];
    }

    /** @return array<string, mixed> */
    public function instructorSummary(User $user): array
    {
        return [
            'id' => (int) $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            ...$this->measurement($user),
        ];
    }

    public function lessonIsBelowThreshold(int $activeSeconds, int $durationSeconds): bool
    {
        if ($durationSeconds <= 0) {
            return false;
        }

        return min(100, $activeSeconds / $durationSeconds * 100) < $this->threshold();
    }

    /** @return array{reliability_percent: int|null, below_threshold: bool} */
    private function measurement(User $user): array
    {
        $percent = $this->percentages[$user->id]
            ??= ProgressAggregator::reliabilityPercent($user);

        return [
            'reliability_percent' => $percent,
            'below_threshold' => $percent !== null && $percent < $this->threshold(),
        ];
    }

    private function threshold(): int
    {
        return $this->threshold ??= (int) Settings::edition('reliability_threshold');
    }
}
