<?php

namespace App\Http\Resources\H12;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupervisorAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'volunteer_id' => (int) $this->volunteer_id,
            'supervisor_id' => (int) $this->supervisor_id,
            'assigned_at' => $this->assigned_at?->toIso8601ZuluString(),
            'unassigned_at' => $this->unassigned_at?->toIso8601ZuluString(),
        ];
    }
}
