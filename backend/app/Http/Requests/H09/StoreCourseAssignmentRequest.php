<?php

namespace App\Http\Requests\H09;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCourseAssignmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        $courseId = (int) $this->route('course');

        return [
            'instructor_id' => [
                'required',
                'integer',
                Rule::exists('users', 'id')
                    ->where('role', 'instructor')
                    ->whereNull('deleted_at'),
            ],
            'lesson_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('lessons', 'id')
                    ->where('course_id', $courseId)
                    ->whereNull('deleted_at'),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'instructor_id.required' => 'Wskaż prowadzącego do przypisania.',
            'instructor_id.integer' => 'Identyfikator prowadzącego musi być liczbą.',
            'instructor_id.exists' => 'Wybrane konto nie jest prowadzącym.',
            'lesson_id.integer' => 'Identyfikator lekcji musi być liczbą.',
            'lesson_id.exists' => 'Wskazana lekcja nie należy do tego kursu.',
        ];
    }
}
