<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class ActivateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8'],
        ];
    }

    public function messages(): array
    {
        return [
            'token.required' => 'Brak tokenu aktywacyjnego.',
            'password.required' => 'Ustaw hasło.',
            'password.min' => 'Hasło musi mieć co najmniej :min znaków.',
        ];
    }
}
