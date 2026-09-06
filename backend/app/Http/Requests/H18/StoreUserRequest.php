<?php

namespace App\Http\Requests\H18;

use App\Rules\Pesel;
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
            'first_name.required' => 'Podaj imię.',
            'first_name.max' => 'Imię jest za długie (maksymalnie 255 znaków).',
            'last_name.required' => 'Podaj nazwisko.',
            'last_name.max' => 'Nazwisko jest za długie (maksymalnie 255 znaków).',
            'email.required' => 'Podaj adres e-mail.',
            'email.email' => 'Podaj poprawny adres e-mail.',
            'email.max' => 'Adres e-mail jest za długi (maksymalnie 255 znaków).',
            'role.required' => 'Wybierz rolę konta.',
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
