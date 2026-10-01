<?php

namespace App\Http\Resources\H08;

use App\Models\Lesson;
use App\Services\Video\LessonRecording;
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
 * Stan nagrania pochodzi z bazy — zasób nigdy nie pyta dostawcy nagrań:
 * `video_status` to stan najnowszego nagrania lekcji (`null` = nieznany),
 * `video_ready` — czy uczestnik dostanie link do nagrania, `video_pending` —
 * czy nowe nagranie jest wysyłane albo przetwarzane.
 *
 * @mixin Lesson
 */
class AdminLessonResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $recording = LessonRecording::of($this->resource);

        return [
            'id' => $this->id,
            'course_id' => $this->course_id,
            'title' => $this->title,
            'description' => $this->description,
            'content' => $this->content,
            'sequence_order' => $this->sequence_order,
            'topic_id' => $this->topic_id,
            'topic_position' => $this->topic_position,
            'video_provider_id' => $this->video_provider_id,
            'duration_seconds' => $this->duration_seconds,
            'materials_count' => (int) $this->materials_count,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
            'video_status' => $recording->status(),
            'video_status_at' => $this->video_status_at?->toIso8601ZuluString(),
            'video_ready' => $recording->hasPlayable(),
            'video_pending' => $recording->hasPending(),
        ];
    }
}
