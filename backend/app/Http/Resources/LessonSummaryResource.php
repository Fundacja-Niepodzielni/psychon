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
    public function __construct(
        Lesson $lesson,
        private readonly bool $isCompleted,
        private readonly bool $locked = false,
        private readonly int $activeSeconds = 0,
        private readonly int $requiredActiveSeconds = 0,
        private readonly bool $hasRecording = false,
    ) {
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
            'topic_id' => $this->topic_id,
            // Zamknięta dla osoby regułą „lekcje po kolei” (`LessonSequence`);
            // zawsze `false` dla personelu i prowadzącego.
            'locked' => $this->locked,
            // Czas aktywny osoby w lekcji (brak postępu: 0) i wymagany czas do
            // ukończenia — te same wartości co w odczycie lekcji (`LessonCompletionRule`).
            'active_seconds' => $this->activeSeconds,
            'required_active_seconds' => $this->requiredActiveSeconds,
            // Czy lekcja ma nagranie (ten sam predykat co reguła ukończenia).
            'has_recording' => $this->hasRecording,
        ];
    }
}
