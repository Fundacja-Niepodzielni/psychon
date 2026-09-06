<?php

namespace App\Http\Requests\H12;

use Illuminate\Foundation\Http\FormRequest;

class AssignSupervisorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'supervisor_id' => ['required', 'integer', 'exists:users,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'supervisor_id.required' => 'Wybierz superwizora.',
            'supervisor_id.integer' => 'Identyfikator superwizora musi być liczbą.',
            'supervisor_id.exists' => 'Wybrany superwizor nie istnieje.',
        ];
    }
}
