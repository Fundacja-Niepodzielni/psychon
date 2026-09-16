<?php

namespace App\Http\Requests\H07;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class ListAdminReliabilityRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        $rules = [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
        ];

        foreach (array_diff(array_keys($this->query()), array_keys($rules)) as $key) {
            $rules[$key] = ['prohibited'];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'integer' => 'To pole musi być liczbą całkowitą.',
            'page.min' => 'Numer strony musi być liczbą co najmniej 1.',
            'per_page.between' => 'Liczba wyników na stronę musi mieścić się między 1 a 100.',
            'prohibited' => 'Tego parametru nie obsługuje to zapytanie.',
        ];
    }
}
