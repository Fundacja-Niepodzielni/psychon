<?php

namespace App\Http\Resources;

use App\Models\Lesson;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Lesson entry of GET /courses/{slug} — contract §2 „Kursy (H05)".
 * The player, the heartbeat and completion belong to H06.
 *
 * @mixin Lesson
 */
class LessonSummaryResource extends JsonResource
{
    public function __construct(Lesson $lesson, private readonly bool $isCompleted)
    {
        parent::__construct($lesson);
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'sequence_order' => $this->sequence_order,
            'duration_seconds' => $this->duration_seconds,
            'is_completed' => $this->isCompleted,
        ];
    }
}
