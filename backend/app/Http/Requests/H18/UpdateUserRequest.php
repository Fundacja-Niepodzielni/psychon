<?php

namespace App\Http\Requests\H18;

use App\Rules\Pesel;
use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PATCH /admin/users/{id} — edycja konta (H18). `email` jest edytowalny
 * wyłącznie tędy (kontrakt §2 H01) i musi pozostać unikalny (z pominięciem
 * bieżącego konta). Konto, reguła matrycy ról i ostatnie aktywne konto
 * administracji są sprawdzane w `authorize()`, przed walidacją ciała;
 * kontroler powtarza je na wierszach zablokowanych.
 */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $guard = app(AccountManagementGuard::class);
        $target = $guard->target($this->route('id'));

        $requestedRole = $this->has('role') ? $this->input('role') : null;

        $guard->assertMayChangeRole($target, $requestedRole);

        if (AccountManagementGuard::removesAdministrativeRole($target, $requestedRole)) {
            AccountManagementGuard::assertNotLastActiveAdministrator($target);
        }

        if (AccountManagementGuard::removesSuperAdminRole($target, $requestedRole)) {
            AccountManagementGuard::assertNotLastActiveSuperAdmin($target);
        }

        return true;
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
