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
            'seats_limit' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'test_pass_threshold' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'test_attempts_limit' => ['sometimes', 'integer', 'min:1'],
            'internship_hours_required' => ['sometimes', 'integer', 'min:1'],
            'supervision_required_count' => ['sometimes', 'integer', 'min:1'],
            'reliability_threshold' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'lesson_completion_percent' => ['sometimes', 'integer', 'min:0', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'test_pass_threshold.max' => 'Próg zaliczenia testu musi mieścić się w zakresie 0-100%.',
            'reliability_threshold.max' => 'Próg rzetelności musi mieścić się w zakresie 0-100%.',
            'lesson_completion_percent.max' => 'Próg ukończenia lekcji musi mieścić się w zakresie 0-100%.',
            'ends_at.after' => 'Data zakończenia musi być późniejsza niż data rozpoczęcia.',
        ];
    }
}
