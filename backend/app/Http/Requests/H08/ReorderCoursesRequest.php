<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/courses/reorder oraz POST /admin/courses/reorder/preview —
 * oba przyjmują ten sam payload, więc dzielą jedną walidację. Sprawdzenie,
 * że lista jest **pełną permutacją** kursów ścieżki, potrzebuje kontekstu
 * ścieżki i mieszka w `SequenceReorderer`.
 */
class ReorderCoursesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'course_ids' => ['required', 'array', 'min:1'],
            'course_ids.*' => ['integer', 'distinct'],
        ];
    }

    public function messages(): array
    {
        return [
            'course_ids.required' => 'Podaj nową kolejność kursów ścieżki.',
            'course_ids.array' => 'Kolejność kursów musi być listą identyfikatorów.',
            'course_ids.min' => 'Podaj co najmniej jeden kurs.',
            'course_ids.*.integer' => 'Identyfikator kursu musi być liczbą całkowitą.',
            'course_ids.*.distinct' => 'Każdy kurs może wystąpić w kolejności tylko raz.',
        ];
    }

    /**
     * @return list<int>
     */
    public function courseIds(): array
    {
        return array_values(array_map(
            static fn ($id): int => (int) $id,
            (array) $this->validated('course_ids'),
        ));
    }
}
