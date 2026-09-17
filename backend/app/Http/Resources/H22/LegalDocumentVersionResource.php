<?php

namespace App\Http\Resources\H22;

use App\Models\LegalDocumentVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Widok administracji — pokazuje szkice i wersje opublikowane wraz ze
 * stanem, w odróżnieniu od {@see PublicLegalDocumentResource}.
 *
 * @mixin LegalDocumentVersion
 */
class LegalDocumentVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'version' => $this->version,
            'content' => $this->content,
            'status' => $this->status,
            'published_at' => $this->published_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
