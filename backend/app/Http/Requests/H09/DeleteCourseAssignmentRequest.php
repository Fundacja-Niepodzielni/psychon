<?php

namespace App\Http\Requests\H09;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class DeleteCourseAssignmentRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
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
