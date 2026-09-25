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
            'updated_by' => $this->updatedBy(),
        ];
    }

    /**
     * Null gdy wzoru jeszcze nikt nie edytowal (np. wprost po zasileniu
     * seedem) - to stan prawdziwy, nie brak danych do naprawienia. Front
     * musi obsluzyc brak tego pola.
     *
     * @return array{id: int, name: string}|null
     */
    private function updatedBy(): ?array
    {
        if ($this->updatedBy === null) {
            return null;
        }

        return [
            'id' => $this->updatedBy->id,
            'name' => $this->updatedBy->fullName(),
        ];
    }
}
