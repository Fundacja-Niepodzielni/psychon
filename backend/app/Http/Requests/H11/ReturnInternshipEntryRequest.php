<?php

namespace App\Http\Requests\H11;

use Illuminate\Foundation\Http\FormRequest;

class ReturnInternshipEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
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
