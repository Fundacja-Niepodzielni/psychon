<?php

namespace App\Http\Resources;

use App\Models\DocumentTemplateVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Edytor wzorow dokumentow - wpis historii (GET /document-templates/{type}/versions).
 * Bez `content` i `type` celowo: to sam odczyt historii (kontrakt), nie
 * podglad tresci archiwalnej wersji.
 *
 * @mixin DocumentTemplateVersion
 */
class DocumentTemplateVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'version' => $this->version,
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
            'updated_by' => $this->updatedBy === null ? null : [
                'id' => $this->updatedBy->id,
                'name' => $this->updatedBy->fullName(),
            ],
        ];
    }
}
