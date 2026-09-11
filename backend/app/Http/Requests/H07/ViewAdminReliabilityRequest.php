<?php

namespace App\Http\Requests\H07;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class ViewAdminReliabilityRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        $rules = [];

        foreach (array_keys($this->query()) as $key) {
            $rules[$key] = ['prohibited'];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'prohibited' => 'Tego parametru nie obsługuje to zapytanie.',
        ];
    }
}
