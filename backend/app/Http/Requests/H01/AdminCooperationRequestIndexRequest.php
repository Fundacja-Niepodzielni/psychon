<?php

namespace App\Http\Requests\H01;

use App\Models\CooperationRequest;
use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdminCooperationRequestIndexRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [
            'status' => ['sometimes', 'nullable', 'string', Rule::in(CooperationRequest::STATUSES)],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'status.in' => 'Nieznany status zgłoszenia.',
            'page.integer' => 'Numer strony musi być liczbą całkowitą.',
            'page.min' => 'Numer strony musi być dodatni.',
            'per_page.integer' => 'Liczba pozycji na stronie musi być liczbą całkowitą.',
            'per_page.min' => 'Liczba pozycji na stronie musi być dodatnia.',
            'per_page.max' => 'Na stronie może być najwyżej 100 pozycji.',
        ];
    }
}
