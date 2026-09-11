<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class AssignSupervisorRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
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
