<?php

namespace App\Http\Resources\H07;

use Illuminate\Http\Request;

class AdminReliabilityDetailResource extends AdminReliabilityResource
{
    public function toArray(Request $request): array
    {
        return [
            ...parent::toArray($request),
            'lessons' => collect($this->resource['lessons'])
                ->map(fn (array $lesson): array => [
                    'id' => $lesson['id'],
                    'title' => $lesson['title'],
                    'active_seconds' => $lesson['active_seconds'],
                    'duration_seconds' => $lesson['duration_seconds'],
                    'open_count' => $lesson['open_count'],
                    'last_activity_at' => $lesson['last_activity_at'],
                    'below_threshold' => $lesson['below_threshold'],
                ])
                ->all(),
        ];
    }
}
