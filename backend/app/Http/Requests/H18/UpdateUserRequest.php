<?php

namespace App\Http\Requests\H18;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PATCH /admin/users/{id} — edycja konta (H18). `email` jest edytowalny
 * wyłącznie tędy (kontrakt §2 H01) i musi pozostać unikalny (z pominięciem
 * bieżącego konta). Reguła matrycy ról (ochrona `super_admin`) jest
 * w kontrolerze, przed zapisem i audytem (design.md D4).
 */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sekcji sprawdzana middlewarem `role:` na trasie
    }

    public function rules(): array
    {
        $id = (int) $this->route('id');

        return [
            'first_name' => ['sometimes', 'string', 'max:255'],
            'last_name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($id)],
            'role' => ['sometimes', Rule::in(['super_admin', 'project_manager', 'instructor', 'volunteer', 'student'])],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'pesel' => ['sometimes', 'nullable', 'string', 'max:32'],
            'address' => ['sometimes', 'array'],
            'address.street' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.city' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.zip' => ['sometimes', 'nullable', 'string', 'max:16'],
            'product_group' => ['sometimes', Rule::in(['psychon', 'dobrostan', 'both'])],
        ];
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'Ten adres e-mail jest już przypisany do innego konta.',
        ];
    }
}
