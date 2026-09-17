<?php

namespace App\Http\Requests\H19;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/edition — częściowa aktualizacja aktywnej edycji. Zakresy
 * zgodnie z design.md D4: pola procentowe 0-100, pola licznikowe ≥1.
 */
class UpdateEditionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after:starts_at'],
            'seats_limit' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:32767', $this->notBoolean('Limit miejsc musi być liczbą całkowitą.')],
            'test_pass_threshold' => ['sometimes', 'integer', 'min:0', 'max:100', $this->notBoolean('Próg zaliczenia testu musi być liczbą całkowitą.')],
            'test_attempts_limit' => ['sometimes', 'integer', 'min:1', 'max:255', $this->notBoolean('Limit podejść do testu musi być liczbą całkowitą.')],
            'internship_hours_required' => ['sometimes', 'integer', 'min:1', 'max:32767', $this->notBoolean('Wymagana liczba godzin stażu musi być liczbą całkowitą.')],
            'supervision_required_count' => ['sometimes', 'integer', 'min:1', 'max:255', $this->notBoolean('Wymagana liczba superwizji musi być liczbą całkowitą.')],
            'reliability_threshold' => ['sometimes', 'integer', 'min:0', 'max:100', $this->notBoolean('Próg rzetelności musi być liczbą całkowitą.')],
            'lesson_completion_percent' => ['sometimes', 'integer', 'min:0', 'max:100', $this->notBoolean('Próg ukończenia lekcji musi być liczbą całkowitą.')],
        ];
    }

    public function messages(): array
    {
        return [
            'integer' => 'To pole musi być liczbą całkowitą.',
            'name.max' => 'Nazwa edycji jest za długa (maksymalnie 255 znaków).',
            'starts_at.date' => 'Podaj poprawną datę rozpoczęcia.',
            'ends_at.date' => 'Podaj poprawną datę zakończenia.',
            'ends_at.after' => 'Data zakończenia musi być późniejsza niż data rozpoczęcia.',
            'seats_limit.min' => 'Limit miejsc musi być liczbą co najmniej 1.',
            'seats_limit.max' => 'Limit miejsc jest za duży (maksymalnie :max).',
            'test_pass_threshold.min' => 'Próg zaliczenia testu musi mieścić się w zakresie 0-100%.',
            'test_pass_threshold.max' => 'Próg zaliczenia testu musi mieścić się w zakresie 0-100%.',
            'test_attempts_limit.min' => 'Limit podejść do testu musi być liczbą co najmniej 1.',
            'test_attempts_limit.max' => 'Limit podejść do testu jest za duży (maksymalnie :max).',
            'internship_hours_required.min' => 'Wymagana liczba godzin stażu musi wynosić co najmniej 1.',
            'internship_hours_required.max' => 'Wymagana liczba godzin stażu jest za duża (maksymalnie :max).',
            'supervision_required_count.min' => 'Wymagana liczba superwizji musi wynosić co najmniej 1.',
            'supervision_required_count.max' => 'Wymagana liczba superwizji jest za duża (maksymalnie :max).',
            'reliability_threshold.min' => 'Próg rzetelności musi mieścić się w zakresie 0-100%.',
            'reliability_threshold.max' => 'Próg rzetelności musi mieścić się w zakresie 0-100%.',
            'lesson_completion_percent.min' => 'Próg ukończenia lekcji musi mieścić się w zakresie 0-100%.',
            'lesson_completion_percent.max' => 'Próg ukończenia lekcji musi mieścić się w zakresie 0-100%.',
        ];
    }

    private function notBoolean(string $message): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($message): void {
            if (is_bool($value)) {
                $fail($message);
            }
        };
    }
}
