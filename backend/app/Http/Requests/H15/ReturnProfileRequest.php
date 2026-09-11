<?php

namespace App\Http\Requests\H15;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class ReturnProfileRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Dodaj powód przed odesłaniem wniosku.',
            'reason.string' => 'Powód musi być tekstem.',
        ];
    }
}
