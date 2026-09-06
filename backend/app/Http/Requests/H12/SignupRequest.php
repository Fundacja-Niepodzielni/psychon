<?php

namespace App\Http\Requests\H12;

use Illuminate\Foundation\Http\FormRequest;

class SignupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'volunteer';
    }

    public function rules(): array
    {
        return [];
    }
}
