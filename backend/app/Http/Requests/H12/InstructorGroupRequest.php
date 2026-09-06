<?php

namespace App\Http\Requests\H12;

use Illuminate\Foundation\Http\FormRequest;

class InstructorGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'instructor';
    }

    public function rules(): array
    {
        return [];
    }
}
