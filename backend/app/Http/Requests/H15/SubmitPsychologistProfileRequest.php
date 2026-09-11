<?php

namespace App\Http\Requests\H15;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class SubmitPsychologistProfileRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('volunteer');
    }

    public function rules(): array
    {
        return [
            'publication_consent' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'publication_consent.boolean' => 'Zgoda na publikację przyjmuje tylko wartość prawda/fałsz.',
        ];
    }
}
