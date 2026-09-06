<?php

namespace App\Http\Requests\H09;

use Illuminate\Foundation\Http\FormRequest;

class DeleteCourseAssignmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'assignment_id' => ['required', 'integer'],
        ];
    }

    public function messages(): array
    {
        return [
            'assignment_id.required' => 'Wskaż przypisanie do odłączenia.',
            'assignment_id.integer' => 'Identyfikator przypisania musi być liczbą.',
        ];
    }
}
