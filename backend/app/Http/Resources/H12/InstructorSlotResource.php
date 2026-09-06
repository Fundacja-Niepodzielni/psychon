<?php

namespace App\Http\Resources\H12;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InstructorSlotResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $activeCount = $this->activeSignupsCount();
        $signups = $this->resource->relationLoaded('signups')
            ? $this->resource->signups
            : $this->resource->signups()
                ->with('user')
                ->whereNull('cancelled_at')
                ->orderBy('user_id')
                ->get();

        return [
            'id' => $this->id,
            'starts_at' => $this->starts_at?->toIso8601ZuluString(),
            'duration_minutes' => (int) $this->duration_minutes,
            'seats_limit' => (int) $this->seats_limit,
            'location_or_link' => $this->location_or_link,
            'active_signups_count' => $activeCount,
            'available_seats' => max(0, (int) $this->seats_limit - $activeCount),
            'signups' => $signups->map(fn ($signup): array => [
                'user' => [
                    'id' => $signup->user->id,
                    'first_name' => $signup->user->first_name,
                    'last_name' => $signup->user->last_name,
                ],
                'signed_up_at' => $signup->signed_up_at?->toIso8601ZuluString(),
                'attendance' => $signup->attendance,
            ])->values()->all(),
        ];
    }

    private function activeSignupsCount(): int
    {
        if (array_key_exists('active_signups_count', $this->resource->getAttributes())) {
            return (int) $this->resource->getAttribute('active_signups_count');
        }

        return (int) $this->resource->signups()->whereNull('cancelled_at')->count();
    }
}
