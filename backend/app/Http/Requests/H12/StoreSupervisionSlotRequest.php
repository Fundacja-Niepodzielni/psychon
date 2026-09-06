<?php

namespace App\Http\Requests\H12;

use Illuminate\Foundation\Http\FormRequest;

class StoreSupervisionSlotRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'instructor';
    }

    public function rules(): array
    {
        return [
            'starts_at' => ['required', 'date'],
            'duration_minutes' => ['sometimes', 'integer', 'min:1', 'max:65535'],
            'seats_limit' => ['sometimes', 'integer', 'min:1', 'max:255'],
            'location_or_link' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'starts_at.required' => 'Podaj datę i godzinę spotkania.',
            'starts_at.date' => 'Podaj prawidłową datę i godzinę spotkania.',
            'duration_minutes.integer' => 'Czas trwania musi być liczbą całkowitą.',
            'duration_minutes.min' => 'Spotkanie musi trwać co najmniej minutę.',
            'duration_minutes.max' => 'Czas trwania jest zbyt długi.',
            'seats_limit.integer' => 'Limit miejsc musi być liczbą całkowitą.',
            'seats_limit.min' => 'Termin musi mieć co najmniej jedno miejsce.',
            'seats_limit.max' => 'Limit miejsc jest zbyt duży.',
            'location_or_link.string' => 'Lokalizacja musi być tekstem.',
            'location_or_link.max' => 'Lokalizacja może mieć najwyżej 255 znaków.',
        ];
    }
}
