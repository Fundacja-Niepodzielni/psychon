<?php

namespace App\Http\Requests\H04;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/users/{id}/extend-access — dokładnie jedno z dwóch pól.
 */
class ExtendAccessRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'months' => ['required_without:until', 'prohibits:until', 'nullable', 'integer', 'min:1', 'max:60'],
            'until' => ['required_without:months', 'prohibits:months', 'nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'months.required_without' => 'Podaj liczbę miesięcy albo konkretną datę.',
            'until.required_without' => 'Podaj liczbę miesięcy albo konkretną datę.',
            'months.prohibits' => 'Podaj tylko jedno: liczbę miesięcy albo datę.',
            'until.prohibits' => 'Podaj tylko jedno: liczbę miesięcy albo datę.',
        ];
    }
}
