<?php

namespace App\Http\Resources\H08;

use App\Models\Material;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pakiet H08b · kształt materiału w panelu administracji.
 *
 * Bez `download_url`: panel nie pobiera plików, a wystawianie podpisanego
 * linku należy do `MaterialResource` (H05) na ścieżce uczestnika.
 *
 * @mixin Material
 */
class AdminMaterialResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'mime' => $this->mime,
            'size' => $this->size,
            'lesson_id' => $this->lesson_id,
            'course_id' => $this->course_id,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
        ];
    }
}
