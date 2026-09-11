<?php

namespace App\Http\Resources;

use App\Models\Consent;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET /me — the full self-profile (H01). The owner always sees their own
 * PESEL in full (contract §2, spec M2); masking for other viewers lives on
 * the person card (H18), not here.
 *
 * `roles` (R2, sprint-2 §1): the LOCAL role names the current access token
 * authorises (`TokenRoles::current()`) — a list, since a user may hold
 * several roles at once. `role` stays for backward compatibility (a
 * frontend on another branch routes by it): display/report copy of
 * `users.role`, never consulted for authorisation. This is the route H01
 * overrides `/me` with (`config('features.h01')`) — the starter's
 * `UserResource` carries the same `roles` field for the flag-off shape.
 *
 * @mixin User
 */
class ProfileResource extends JsonResource
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
            'phone' => $this->phone,
            'pesel' => $this->pesel,
            'address' => [
                'street' => $this->address_street,
                'city' => $this->address_city,
                'zip' => $this->address_zip,
            ],
            'access_expires_at' => $this->access_expires_at?->toIso8601ZuluString(),
            'program_completed_at' => $this->program_completed_at?->toIso8601ZuluString(),
            'product_group' => $this->product_group,
            'consents' => $this->consents
                ->map(fn (Consent $consent): array => [
                    'type' => $consent->type,
                    'document_version' => $consent->document_version,
                    'granted_at' => $consent->granted_at?->toIso8601ZuluString(),
                    'withdrawn_at' => $consent->withdrawn_at?->toIso8601ZuluString(),
                    'status' => $consent->withdrawn_at !== null ? 'withdrawn' : 'granted',
                ])
                ->values()
                ->all(),
        ];
    }
}
