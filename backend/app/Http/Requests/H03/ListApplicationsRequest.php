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
}
