<?php

namespace App\Http\Requests\H18;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/users/{id}/block — zablokowanie konta z wymaganym powodem
 * (H18). Powód trafia do audytu `user.blocked` (kontrakt §3.2).
 */
class BlockUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sekcji sprawdzana middlewarem `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:1', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Podaj powód blokady konta.',
        ];
    }
}
