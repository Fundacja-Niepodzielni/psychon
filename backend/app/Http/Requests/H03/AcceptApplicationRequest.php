<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class AcceptApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $actor = $this->user();

        if (! in_array($actor?->role, ['project_manager', 'super_admin'], true)) {
            return false;
        }

        return $actor->role === 'super_admin' || $this->input('role') !== 'super_admin';
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
