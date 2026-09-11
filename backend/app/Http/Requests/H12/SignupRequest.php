<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class SignupRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('volunteer');
    }

    public function rules(): array
    {
        return [];
    }
}
