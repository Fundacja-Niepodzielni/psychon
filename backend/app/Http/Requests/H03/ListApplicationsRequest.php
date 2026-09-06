<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class ListApplicationsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'status' => ['sometimes', 'string', 'in:new,accepted,rejected'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sort' => ['sometimes', 'string', 'in:created_at,-created_at,first_name,-first_name,status,-status'],
        ];
    }

    public function messages(): array
    {
        return [
            'integer' => 'To pole musi być liczbą całkowitą.',
            'string' => 'To pole musi być tekstem.',
            'page.min' => 'Numer strony musi być liczbą co najmniej 1.',
            'per_page.min' => 'Liczba wyników na stronę musi być liczbą co najmniej 1.',
            'per_page.max' => 'Liczba wyników na stronę może wynosić najwyżej 100.',
            'status.in' => 'Nieznany status zgłoszenia.',
            'search.max' => 'Fraza wyszukiwania jest za długa (maksymalnie 255 znaków).',
            'sort.in' => 'Nieznane kryterium sortowania.',
        ];
    }
}
