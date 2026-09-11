<?php

namespace App\Http\Requests\H03;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class RejectApplicationRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'filled'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Podaj powód odrzucenia zgłoszenia.',
            'reason.filled' => 'Podaj powód odrzucenia zgłoszenia.',
            'reason.string' => 'Powód odrzucenia musi być tekstem.',
        ];
    }
}
