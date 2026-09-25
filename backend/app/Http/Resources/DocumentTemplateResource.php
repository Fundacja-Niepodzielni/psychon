<?php

namespace App\Http\Resources;

use App\Models\DocumentTemplate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Edytor wzorow dokumentow - biezacy wzor (GET/PUT /document-templates/{type}).
 *
 * @mixin DocumentTemplate
 */
class DocumentTemplateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'type' => $this->type,
            'content' => $this->content,
            'version' => $this->version,
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
            'updated_by' => $this->updatedBy === null ? null : [
                'id' => $this->updatedBy->id,
                'name' => $this->updatedBy->fullName(),
            ],
        ];
    }
}
