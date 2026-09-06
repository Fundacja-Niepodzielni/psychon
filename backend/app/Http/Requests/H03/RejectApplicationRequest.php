<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class RejectApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
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
