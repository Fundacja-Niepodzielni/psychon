<?php

namespace App\Http\Requests\H15;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePsychologistProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'volunteer';
    }

    public function rules(): array
    {
        return [
            'specializations' => ['sometimes', 'array'],
            'specializations.*' => ['string'],
            'approach' => ['sometimes', 'nullable', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:255'],
            'bio' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
