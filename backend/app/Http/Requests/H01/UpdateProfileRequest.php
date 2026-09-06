<?php

namespace App\Http\Requests\H01;

use App\Rules\Pesel;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /me — profile fields only. `email` is read-only (contract §2, criterion 2):
 * it is stripped before validation, so sending it changes nothing.
 * Address is nested to mirror the GET /me shape (`address: {street, city, zip}`).
 */
class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->request->remove('email');
    }

    public function rules(): array
    {
        return [
            'first_name' => ['sometimes', 'string', 'max:255'],
            'last_name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'pesel' => ['sometimes', 'nullable', 'string', new Pesel],
            'address' => ['sometimes', 'array'],
            'address.street' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.city' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.zip' => ['sometimes', 'nullable', 'string', 'max:16'],
        ];
    }

    public function messages(): array
    {
        return [
            'first_name.max' => 'Imię jest za długie (maksymalnie :max znaków).',
            'last_name.max' => 'Nazwisko jest za długie (maksymalnie :max znaków).',
            'phone.max' => 'Numer telefonu jest za długi.',
            'address.zip.max' => 'Kod pocztowy jest za długi.',
        ];
    }
}
