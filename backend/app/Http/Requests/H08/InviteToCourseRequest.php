<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/courses/{course}/invite — zaproszenie osób na kurs poza główną
 * ścieżką. Reguła domenowa „tylko kurs spoza ścieżki" potrzebuje kursu
 * i mieszka w `CourseInviter`.
 */
class InviteToCourseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'user_ids' => ['required', 'array', 'min:1'],
            'user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'user_ids.required' => 'Wskaż osoby, które chcesz zaprosić.',
            'user_ids.array' => 'Lista zapraszanych osób musi być listą identyfikatorów.',
            'user_ids.min' => 'Wskaż co najmniej jedną osobę.',
            'user_ids.*.integer' => 'Identyfikator osoby musi być liczbą całkowitą.',
            'user_ids.*.distinct' => 'Każda osoba może wystąpić na liście tylko raz.',
            'user_ids.*.exists' => 'Nie znaleziono wskazanej osoby.',
        ];
    }

    /**
     * @return list<int>
     */
    public function userIds(): array
    {
        return array_values(array_map(
            static fn ($id): int => (int) $id,
            (array) $this->validated('user_ids'),
        ));
    }
}
