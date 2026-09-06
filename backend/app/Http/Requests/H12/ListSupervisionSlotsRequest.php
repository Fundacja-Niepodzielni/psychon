<?php

namespace App\Http\Requests\H12;

use Illuminate\Foundation\Http\FormRequest;

class ListSupervisionSlotsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'volunteer';
    }

    public function rules(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'page.integer' => 'Numer strony musi być liczbą całkowitą.',
            'page.min' => 'Numer strony musi być większy od zera.',
            'per_page.integer' => 'Liczba elementów na stronie musi być całkowita.',
            'per_page.min' => 'Na stronie musi znajdować się co najmniej jeden element.',
            'per_page.max' => 'Na stronie może znajdować się najwyżej 100 elementów.',
        ];
    }
}
