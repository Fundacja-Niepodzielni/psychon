<?php

namespace App\Http\Requests\H12\Concerns;

/**
 * One rule set for a supervision slot, shared by the instructor's create
 * request and the administration's update request. An update differs only in
 * that `starts_at` is optional.
 */
trait SupervisionSlotRules
{
    /**
     * @return array<string, array<int, string>>
     */
    protected function slotRules(bool $partial): array
    {
        return [
            'starts_at' => [$partial ? 'sometimes' : 'required', 'date'],
            'duration_minutes' => ['sometimes', 'integer', 'min:1', 'max:65535'],
            'seats_limit' => ['sometimes', 'integer', 'min:1', 'max:255'],
            'location_or_link' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
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
