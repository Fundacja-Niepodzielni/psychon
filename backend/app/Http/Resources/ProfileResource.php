<?php

namespace App\Http\Resources;

use App\Models\Consent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET /me — the full self-profile (H01). The owner always sees their own
 * PESEL in full (contract §2, spec M2); masking for other viewers lives on
 * the person card (H18), not here.
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
