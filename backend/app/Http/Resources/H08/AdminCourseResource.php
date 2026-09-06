<?php

namespace App\Http\Resources\H08;

use App\Models\Course;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pakiet H08 · kształt kursu w panelu administracji. Bogatszy niż zasób
 * uczestnika (H05), bo panel musi widzieć szkice i liczności — ale celowo
 * nie dubluje `status` ani `progress_percent`: to pojęcia ścieżki
 * uczestnika liczone przez `CourseAccess`, nie CMS-a.
 *
 * `materials_count` obejmuje materiały wpięte wprost w kurs; materiały
 * lekcji liczy zasób lekcji (faza 3).
 *
 * @mixin Course
 */
class AdminCourseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'description' => $this->description,
            'type' => $this->type,
            'product_group' => $this->product_group,
            'sequence_order' => $this->sequence_order,
            'edition_id' => $this->edition_id,
            'is_published' => (bool) $this->is_published,
            'lessons_count' => (int) $this->lessons_count,
            'materials_count' => (int) $this->materials_count,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
