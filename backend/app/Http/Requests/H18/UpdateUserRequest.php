<?php

namespace App\Http\Requests\H18;

use App\Rules\Pesel;
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
            'pesel' => ['sometimes', 'nullable', 'string', new Pesel],
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
            'string' => 'To pole musi być tekstem.',
            'first_name.max' => 'Imię jest za długie (maksymalnie 255 znaków).',
            'last_name.max' => 'Nazwisko jest za długie (maksymalnie 255 znaków).',
            'email.email' => 'Podaj poprawny adres e-mail.',
            'email.max' => 'Adres e-mail jest za długi (maksymalnie 255 znaków).',
            'email.unique' => 'Ten adres e-mail jest już przypisany do innego konta.',
            'role.in' => 'Nieznana rola.',
            'phone.max' => 'Numer telefonu jest za długi.',
            'address.array' => 'Adres ma nieprawidłowy format.',
            'address.street.max' => 'Ulica jest za długa (maksymalnie 255 znaków).',
            'address.city.max' => 'Miasto jest za długie (maksymalnie 255 znaków).',
            'address.zip.max' => 'Kod pocztowy jest za długi.',
            'product_group.in' => 'Nieznana grupa produktowa.',
        ];
    }
}
