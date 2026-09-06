<?php

namespace App\Http\Requests\H15;

use Illuminate\Foundation\Http\FormRequest;

class SubmitPsychologistProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'volunteer';
    }

    public function rules(): array
    {
        return [
            'publication_consent' => ['sometimes', 'boolean'],
        ];
    }
}
