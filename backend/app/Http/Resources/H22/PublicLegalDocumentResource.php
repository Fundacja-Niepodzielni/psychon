<?php

namespace App\Http\Resources\H22;

use App\Models\LegalDocumentVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Odczyt publiczny (bez tokenu) — wyłącznie pola dokumentu, bez śladu po
 * żadnej osobie. Zawsze wersja opublikowana (kontroler nie wywołuje tego
 * zasobu dla szkicu).
 *
 * @mixin LegalDocumentVersion
 */
class PublicLegalDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'type' => $this->type,
            'version' => $this->version,
            'content' => $this->content,
            'published_at' => $this->published_at?->toIso8601ZuluString(),
        ];
    }
}
