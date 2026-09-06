<?php

namespace App\Http\Requests\H21;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/onboarding — częściowa aktualizacja treści ekranu „Zacznij tutaj".
 *
 * Każda sekcja opcjonalna; jeśli sekcja jest podana, jej pola tekstowe są wymagane
 * (poza `video.url`, które może być puste). Dostęp pilnuje middleware `role`.
 */
class UpdateOnboardingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'video' => ['sometimes', 'array'],
            'video.title' => ['required_with:video', 'string', 'max:200'],
            'video.url' => ['nullable', 'url', 'max:500'],
            'video.caption' => ['nullable', 'string', 'max:500'],

            'program' => ['sometimes', 'array'],
            'program.title' => ['required_with:program', 'string', 'max:200'],
            'program.body' => ['required_with:program', 'string', 'max:4000'],

            'expectations' => ['sometimes', 'array'],
            'expectations.title' => ['required_with:expectations', 'string', 'max:200'],
            'expectations.body' => ['required_with:expectations', 'string', 'max:4000'],
        ];
    }

    public function messages(): array
    {
        return [
            'required_with' => 'To pole jest wymagane.',
            'video.url' => 'Podaj poprawny adres URL filmu.',
            'string' => 'To pole musi być tekstem.',
            'max' => 'Tekst jest za długi (maksymalnie :max znaków).',
        ];
    }
}
