<?php

namespace App\Http\Requests\H11\Concerns;

use Illuminate\Validation\Rule;

/**
 * Single rule set for creating and updating internship form dictionary items.
 * An update differs only in that every field is optional and the name
 * uniqueness check ignores the item being edited.
 */
trait InternshipFormRules
{
    /**
     * @return array<string, array<int, mixed>>
     */
    protected function formRules(bool $partial, ?int $ignoreId = null): array
    {
        $presence = $partial ? 'sometimes' : 'required';
        $unique = Rule::unique('internship_forms', 'name');

        if ($ignoreId !== null) {
            $unique = $unique->ignore($ignoreId);
        }

        return [
            'name' => [$presence, 'string', 'max:100', $unique],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Podaj nazwę formy stażu.',
            'name.string' => 'Nazwa formy musi być tekstem.',
            'name.max' => 'Nazwa formy może mieć najwyżej 100 znaków.',
            'name.unique' => 'Forma o tej nazwie już istnieje.',
            'description.string' => 'Opis formy musi być tekstem.',
            'description.max' => 'Opis formy może mieć najwyżej 2000 znaków.',
            'is_active.boolean' => 'Pole aktywności musi mieć wartość tak albo nie.',
            'sort_order.integer' => 'Kolejność musi być liczbą całkowitą.',
            'sort_order.min' => 'Kolejność nie może być ujemna.',
            'sort_order.max' => 'Kolejność jest zbyt duża.',
        ];
    }
}
