<?php

namespace App\Http\Requests\H07;

use Illuminate\Foundation\Http\FormRequest;

class ListAdminReliabilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
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
}
