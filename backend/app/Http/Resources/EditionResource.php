<?php

namespace App\Http\Resources;

use App\Models\Edition;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET/PATCH /admin/edition — aktywna edycja i komplet kluczy ustawień z
 * kontraktu §3.3.
 *
 * @mixin Edition
 */
class EditionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'starts_at' => $this->starts_at?->toDateString(),
            'ends_at' => $this->ends_at?->toDateString(),
            'seats_limit' => $this->seats_limit,
            'test_pass_threshold' => $this->test_pass_threshold,
            'test_attempts_limit' => $this->test_attempts_limit,
            'internship_hours_required' => $this->internship_hours_required,
            'supervision_required_count' => $this->supervision_required_count,
            'reliability_threshold' => $this->reliability_threshold,
            'lesson_completion_percent' => $this->lesson_completion_percent,
        ];
    }
}
