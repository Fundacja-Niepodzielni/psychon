<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class StoreApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'edition_id' => ['sometimes', 'nullable', 'integer', 'exists:editions,id'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'source' => ['sometimes', 'nullable', 'string', 'max:64'],
            'role' => ['sometimes', 'nullable', 'string', 'in:super_admin,project_manager,instructor,volunteer,student'],
            'payload' => ['sometimes', 'nullable', 'array'],
            'university' => ['sometimes', 'nullable', 'string', 'max:255'],
            'graduation_year' => ['sometimes', 'nullable', 'integer', 'min:1900', 'max:'.(now()->year + 1)],
        ];
    }
}
