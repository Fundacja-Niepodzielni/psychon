<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Minimal user shape for the starter (login response and GET /me).
 * The full profile (PESEL, address, phone…) is package H01 — extend it
 * there via the integration staff (guide §5.1: /me shape is staff-owned).
 */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'role' => $this->role,
            'access_expires_at' => $this->access_expires_at?->toIso8601ZuluString(),
            'program_completed_at' => $this->program_completed_at?->toIso8601ZuluString(),
        ];
    }
}
