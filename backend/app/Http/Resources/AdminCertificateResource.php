<?php

namespace App\Http\Resources;

use App\Models\Certificate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wiersz listy certyfikatów w panelu administracji (H13,
 * `GET /admin/certificates`) i odpowiedź unieważnienia
 * (`POST /admin/certificates/{certificate}/revoke`).
 *
 * @mixin Certificate
 */
class AdminCertificateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'issued_at' => $this->issued_at?->toIso8601ZuluString(),
            'status' => $this->revoked_at !== null ? 'revoked' : 'valid',
            'edition' => $this->edition?->name,
            'user' => $this->user === null ? null : [
                'id' => $this->user->id,
                'first_name' => $this->user->first_name,
                'last_name' => $this->user->last_name,
            ],
            'revoked_at' => $this->revoked_at?->toIso8601ZuluString(),
            'revoked_reason' => $this->revoked_reason,
            'revoked_by' => $this->revoked_by,
        ];
    }
}
