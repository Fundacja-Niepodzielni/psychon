<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class InstructorGroupRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('instructor');
    }

    public function rules(): array
    {
        return [];
    }
}
