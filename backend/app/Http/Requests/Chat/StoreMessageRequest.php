<?php

namespace App\Http\Requests\Chat;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Zgrubna autoryzacja rolą (`TokenRoles`, nigdy `users.role` — R2). Czy TA
 * konkretna osoba widzi TEN konkretny wątek rozstrzyga dopiero kontroler
 * przez `ChatThreadQuery::visibleTo`, żeby zwrócić 404 zamiast 403 — nie
 * ujawniać istnienia cudzego wątku (kontrakt §1.1).
 */
class StoreMessageRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('volunteer', 'instructor');
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:1', 'max:5000'],
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Wpisz treść wiadomości.',
            'body.max' => 'Wiadomość jest za długa (maksymalnie 5000 znaków).',
        ];
    }
}
