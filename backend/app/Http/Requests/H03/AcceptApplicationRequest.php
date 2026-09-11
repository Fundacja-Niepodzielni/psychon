<?php

namespace App\Http\Requests\H03;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class AcceptApplicationRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        if (! $roles->has('project_manager', 'super_admin')) {
            return false;
        }

        return $roles->has('super_admin') || $this->input('role') !== 'super_admin';
    }

    public function rules(): array
    {
        return [
            'role' => ['required', 'string', 'in:super_admin,project_manager,instructor,volunteer,student'],
            'force' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'role.required' => 'Wybierz rolę dla przyjmowanej osoby.',
            'role.in' => 'Nieznana rola.',
            'force.boolean' => 'Pole wymuszenia limitu przyjmuje tylko wartość prawda/fałsz.',
        ];
    }
}
