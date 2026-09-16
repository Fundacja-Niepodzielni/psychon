<?php

namespace App\Http\Resources;

use App\Models\Edition;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;

/**
 * Wiersz listy certyfikatów w panelu administracji (H13,
 * `GET /admin/certificates`) i odpowiedź unieważnienia
 * (`POST /admin/certificates/{certificate}/revoke`).
 *
 * Właściwości wypisane wprost (zamiast `@mixin Certificate`) — `issued_at` i
 * `revoked_at` to rzutowania `datetime` (`Certificate::casts()`), a `edition`
 * i `user` to relacje `belongsTo`; żadne z nich analiza statyczna nie
 * wyprowadzi z samego modelu bez tej deklaracji.
 *
 * @property int $id
 * @property string $number
 * @property Carbon|null $issued_at
 * @property Carbon|null $revoked_at
 * @property string|null $revoked_reason
 * @property int|null $revoked_by
 * @property-read Edition|null $edition
 * @property-read User|null $user
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
