<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class ResetPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string'],
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string', 'min:8'],
        ];
    }

    public function messages(): array
    {
        return [
            'token.required' => 'Brak tokenu resetu hasła.',
            'email.required' => 'Podaj adres e-mail.',
            'email.email' => 'Podaj prawidłowy adres e-mail.',
            'password.required' => 'Podaj nowe hasło.',
            'password.min' => 'Hasło musi mieć co najmniej :min znaków.',
        ];
    }
}
