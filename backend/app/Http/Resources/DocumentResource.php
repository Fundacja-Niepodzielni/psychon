<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;

/**
 * @property int $id
 * @property string $type
 * @property string $number
 * @property Carbon|null $generated_at
 * @property string $signature_status
 */
class DocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'number' => $this->number,
            'generated_at' => $this->generated_at?->toIso8601ZuluString(),
            'signature_status' => $this->signature_status,
            // Generated fresh on every response (design D6) — never persisted.
            'download_url' => URL::temporarySignedRoute(
                'documents.download',
                now()->addMinutes(15),
                ['document' => $this->id],
            ),
        ];
    }
}
