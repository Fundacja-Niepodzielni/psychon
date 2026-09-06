<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/lessons/{lesson} — częściowa aktualizacja lekcji. Każde pole
 * z `sometimes`, żeby żądanie zmieniające jedną kolumnę nie wymuszało
 * przesłania całego zasobu.
 *
 * Jawny `null` w `sequence_order` zostawia dotychczasową pozycję: kolumna
 * `lessons.sequence_order` nie jest nullable, a przestawianie kolejności ma
 * własną trasę (faza 4).
 */
class UpdateLessonRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'sequence_order' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'video_provider_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'duration_seconds' => ['sometimes', 'integer', 'min:0'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.max' => 'Tytuł lekcji może mieć najwyżej 255 znaków.',
            'sequence_order.min' => 'Pozycja lekcji musi być liczbą co najmniej 1.',
            'video_provider_id.max' => 'Identyfikator nagrania może mieć najwyżej 255 znaków.',
            'duration_seconds.integer' => 'Czas trwania podaj w pełnych sekundach.',
            'duration_seconds.min' => 'Czas trwania nie może być ujemny.',
        ];
    }
}
