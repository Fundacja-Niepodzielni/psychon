<?php

namespace App\Http\Resources\H11;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternshipEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'date' => $this->date?->format('Y-m-d'),
            'hours' => (string) $this->hours,
            'form' => $this->form,
            'consultations_count' => (int) $this->consultations_count,
            'description' => $this->description,
            'status' => $this->status,
            'review_comment' => $this->review_comment,
            'decided_at' => $this->decided_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
