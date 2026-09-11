<?php

namespace App\Http\Resources;

use App\Services\Auth\TokenRoles;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Minimal user shape for the starter (login response and GET /me).
 * The full profile (PESEL, address, phone…) is package H01 — extend it
 * there via the integration staff (guide §5.1: /me shape is staff-owned).
 *
 * `roles` (R2, sprint-2 §1): the LOCAL role names the current access token
 * authorises, i.e. `TokenRoles::current()` — a list, since a user may hold
 * several roles at once. `role` stays for backward compatibility (a
 * frontend on another branch routes by it): display/report copy of
 * `users.role`, never consulted for authorisation. The two CAN disagree —
 * that disagreement is the point (§3), `roles` is what a client should act
 * on for anything access-related.
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
            'roles' => app(TokenRoles::class)->current(),
            'access_expires_at' => $this->access_expires_at?->toIso8601ZuluString(),
            'program_completed_at' => $this->program_completed_at?->toIso8601ZuluString(),
        ];
    }
}
