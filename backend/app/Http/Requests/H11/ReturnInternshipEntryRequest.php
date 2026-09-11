<?php

namespace App\Http\Requests\H11;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class ReturnInternshipEntryRequest extends FormRequest
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
            'comment.required' => 'Dodaj komentarz przed odesłaniem wpisu.',
            'comment.string' => 'Komentarz musi być tekstem.',
        ];
    }
}
