<?php

namespace App\Http\Requests\H15;

use Illuminate\Foundation\Http\FormRequest;

class ReturnProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
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
