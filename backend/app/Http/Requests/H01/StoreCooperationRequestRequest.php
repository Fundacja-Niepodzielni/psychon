<?php

namespace App\Http\Requests\H01;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Zgłoszenie dalszej współpracy składa uczestniczka albo uczestnik.
 * Warunek „program zakończony” sprawdza kontroler (403 `program_not_completed`),
 * a nie ta klasa — to reguła domenowa, nie brak roli.
 */
class StoreCooperationRequestRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('volunteer', 'student');
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Napisz, jakiej współpracy dotyczy zgłoszenie.',
            'body.string' => 'Treść zgłoszenia musi być tekstem.',
            'body.max' => 'Treść zgłoszenia może mieć najwyżej 2000 znaków.',
        ];
    }
}
