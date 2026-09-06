<?php

namespace App\Http\Resources\H08;

use App\Models\Lesson;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pakiet H08 · kształt lekcji w panelu administracji.
 *
 * `video_provider_id` to tekstowy identyfikator nagrania w mocku odtwarzacza
 * (kontrakt §4 wyłącza prawdziwe Bunny Stream), nie ścieżka do pliku.
 * Zasób nie dubluje `is_completed` ani liczników postępu — to pojęcia ścieżki
 * uczestnika (H06), nie CMS-a.
 *
 * @mixin Lesson
 */
class AdminLessonResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'course_id' => $this->course_id,
            'title' => $this->title,
            'description' => $this->description,
            'sequence_order' => $this->sequence_order,
            'video_provider_id' => $this->video_provider_id,
            'duration_seconds' => $this->duration_seconds,
            'materials_count' => (int) $this->materials_count,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
