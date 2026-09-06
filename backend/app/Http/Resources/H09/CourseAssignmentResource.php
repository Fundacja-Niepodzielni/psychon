<?php

namespace App\Http\Resources\H09;

use App\Models\CourseAssignment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin CourseAssignment
 */
class CourseAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (int) $this->id,
            'course_id' => (int) $this->course_id,
            'lesson_id' => $this->lesson_id !== null ? (int) $this->lesson_id : null,
            'instructor' => [
                'id' => (int) $this->instructor->id,
                'first_name' => $this->instructor->first_name,
                'last_name' => $this->instructor->last_name,
            ],
            'assigned_by' => $this->assigned_by !== null ? (int) $this->assigned_by : null,
            'assigned_at' => $this->assigned_at?->toIso8601ZuluString(),
            'unassigned_at' => $this->unassigned_at?->toIso8601ZuluString(),
        ];
    }
}
