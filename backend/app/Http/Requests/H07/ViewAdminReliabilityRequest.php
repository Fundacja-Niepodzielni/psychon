<?php

namespace App\Http\Requests\H07;

use Illuminate\Foundation\Http\FormRequest;

class ViewAdminReliabilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        $rules = [];

        foreach (array_keys($this->query()) as $key) {
            $rules[$key] = ['prohibited'];
        }

        return $rules;
    }
}
