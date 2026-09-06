<?php

namespace App\Http\Requests\H09;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Edycja własnej wizytówki przez prowadzącego. Przyjmuje wyłącznie pola
 * wizytówki — `user_id` i `supervisor_id` nie są polami wejściowymi
 * (własny superwizor prowadzącego ustawia administracja).
 */
class UpdateMyInstructorProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'instructor';
    }

    public function rules(): array
    {
        return [
            'specializations' => ['sometimes', 'array'],
            'specializations.*' => ['string', 'max:120'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'experience' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'responsibilities' => ['sometimes', 'array'],
            'responsibilities.*' => ['string', 'max:200'],
        ];
    }

    public function messages(): array
    {
        return [
            'specializations.array' => 'Specjalizacje podaj jako listę.',
            'specializations.*.string' => 'Każda specjalizacja musi być tekstem.',
            'responsibilities.array' => 'Zakres odpowiedzialności podaj jako listę.',
            'responsibilities.*.string' => 'Każda pozycja odpowiedzialności musi być tekstem.',
            'bio.max' => 'Opis może mieć maksymalnie 2000 znaków.',
            'experience.max' => 'Doświadczenie może mieć maksymalnie 2000 znaków.',
        ];
    }
}
