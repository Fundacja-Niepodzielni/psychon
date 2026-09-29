<?php

namespace App\Http\Resources\H08;

use App\Models\CourseTopic;
use App\Services\H08\TopicLayout;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pakiet H08 · kształt tematu w panelu administracji i prowadzącego.
 * `lesson_ids` to żywe lekcje tematu w jego kolejności — dokładnie ta lista,
 * którą ekran odsyła w `PATCH …/topics/reorder`.
 *
 * @mixin CourseTopic
 */
class CourseTopicResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'course_id' => $this->course_id,
            'title' => $this->title,
            'position' => $this->position,
            'lesson_ids' => TopicLayout::lessonIdsOf($this->resource),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
