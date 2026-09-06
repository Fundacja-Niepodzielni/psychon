<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class AcceptApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $actor = $this->user();

        if (! in_array($actor?->role, ['project_manager', 'super_admin'], true)) {
            return false;
        }

        return $actor->role === 'super_admin' || $this->input('role') !== 'super_admin';
    }

    public function rules(): array
    {
        return [
            'role' => ['required', 'string', 'in:super_admin,project_manager,instructor,volunteer,student'],
            'force' => ['sometimes', 'boolean'],
        ];
    }
}
