<?php

namespace App\Http\Requests\H18;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /admin/users — utworzenie konta z zaproszeniem (H18).
 * Duplikat e-maila istniejącego konta obsługuje kontroler jako 409
 * `email_already_registered` (kontrakt §1.1 / H03) — dlatego bez reguły
 * `unique` na `email`. Reguła matrycy ról (ochrona `super_admin`) też
 * jest w kontrolerze, przed zapisem i audytem (design.md D4).
 */
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sekcji sprawdzana middlewarem `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'role' => ['required', Rule::in(['super_admin', 'project_manager', 'instructor', 'volunteer', 'student'])],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'pesel' => ['sometimes', 'nullable', 'string', 'max:32'],
            'address' => ['sometimes', 'array'],
            'address.street' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.city' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.zip' => ['sometimes', 'nullable', 'string', 'max:16'],
            'product_group' => ['sometimes', Rule::in(['psychon', 'dobrostan', 'both'])],
        ];
    }
}
