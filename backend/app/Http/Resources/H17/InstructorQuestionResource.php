<?php

namespace App\Http\Resources\H17;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The instructor's view: the asker's identity is limited to the three fields the
 * inbox needs to address a person, and the lesson carries its course so the panel
 * can link back without a second request.
 */
class InstructorQuestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'lesson_id' => (int) $this->lesson_id,
            'question' => $this->question,
            'answer' => $this->answer,
            'answered_by' => $this->answered_by === null ? null : (int) $this->answered_by,
            'answered_by_name' => $this->answeredBy?->fullName(),
            'answered_at' => $this->answered_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
            'user' => [
                'id' => (int) $this->user->id,
                'first_name' => $this->user->first_name,
                'last_name' => $this->user->last_name,
            ],
            'lesson' => [
                'id' => (int) $this->lesson->id,
                'title' => $this->lesson->title,
                'course' => [
                    'id' => (int) $this->lesson->course->id,
                    'slug' => $this->lesson->course->slug,
                    'title' => $this->lesson->course->title,
                ],
            ],
        ];
    }
}
