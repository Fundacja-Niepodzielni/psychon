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
 * several roles at once. `role` is kept for the
 * backward-compatible singular shape, but on a self view (this resource's
 * account IS the token's own account) it is now `TokenRoles::
 * effectiveRoleFor()` — the SAME source that decides access — never a raw,
 * possibly stale, copy of `users.role`. A client gating on `role` now
 * agrees with what a protected route actually does; see
 * `TokenRoles::effectiveRoleFor()` for the self-view rule and the
 * disagreement log.
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
            'role' => app(TokenRoles::class)->effectiveRoleFor($this->resource),
            'roles' => app(TokenRoles::class)->current(),
            'access_expires_at' => $this->access_expires_at?->toIso8601ZuluString(),
            'program_completed_at' => $this->program_completed_at?->toIso8601ZuluString(),
        ];
    }
}
