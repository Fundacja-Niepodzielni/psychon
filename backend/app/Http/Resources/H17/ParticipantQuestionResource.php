<?php

namespace App\Http\Resources\H17;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The asker's view of their own question. Deliberately narrower than the
 * instructor resource: the answering instructor appears as a name only, never as
 * an id or an e-mail address.
 */
class ParticipantQuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'lesson_id' => (int) $this->lesson_id,
            'question' => $this->question,
            'answer' => $this->answer,
            'answered_by_name' => $this->answeredBy?->fullName(),
            'answered_at' => $this->answered_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
