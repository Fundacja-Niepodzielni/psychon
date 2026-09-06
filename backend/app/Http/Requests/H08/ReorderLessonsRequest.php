<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/courses/{course}/lessons/reorder — nowa kolejność lekcji kursu.
 * Tu żyją wyłącznie reguły pola; sprawdzenie, że lista jest **pełną
 * permutacją** lekcji kursu, potrzebuje kontekstu kursu i mieszka
 * w `SequenceReorderer`.
 */
class ReorderLessonsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'lesson_ids' => ['required', 'array', 'min:1'],
            'lesson_ids.*' => ['integer', 'distinct'],
        ];
    }

    public function messages(): array
    {
        return [
            'lesson_ids.required' => 'Podaj nową kolejność lekcji.',
            'lesson_ids.array' => 'Kolejność lekcji musi być listą identyfikatorów.',
            'lesson_ids.min' => 'Podaj co najmniej jedną lekcję.',
            'lesson_ids.*.integer' => 'Identyfikator lekcji musi być liczbą całkowitą.',
            'lesson_ids.*.distinct' => 'Każda lekcja może wystąpić w kolejności tylko raz.',
        ];
    }

    /**
     * @return list<int>
     */
    public function lessonIds(): array
    {
        return array_values(array_map(
            static fn ($id): int => (int) $id,
            (array) $this->validated('lesson_ids'),
        ));
    }
}
