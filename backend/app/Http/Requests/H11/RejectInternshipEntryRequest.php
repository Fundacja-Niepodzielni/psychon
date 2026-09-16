<?php

namespace App\Http\Requests\H11;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class RejectInternshipEntryRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [
            'comment' => ['required', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'comment.required' => 'Dodaj powód przed odrzuceniem wpisu.',
            'comment.string' => 'Powód musi być tekstem.',
        ];
    }
}
