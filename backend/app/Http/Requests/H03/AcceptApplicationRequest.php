<?php

namespace App\Http\Requests\H03;

use App\Services\Auth\TokenRoles;
use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Http\FormRequest;

class AcceptApplicationRequest extends FormRequest
{
    /**
     * Przyjęcie zakłada konto, więc rolę administracyjną w ciele rozstrzyga ta
     * sama reguła i ta sama odmowa co założenie konta w panelu osób (H18):
     * dostęp jest rozstrzygnięty przed walidacją ciała.
     */
    public function authorize(TokenRoles $roles): bool
    {
        if (! $roles->has('project_manager', 'super_admin')) {
            return false;
        }

        app(AccountManagementGuard::class)->assertMayCreateWithRole($this->input('role'));

        return true;
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
