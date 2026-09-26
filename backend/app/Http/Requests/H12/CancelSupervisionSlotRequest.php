<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class CancelSupervisionSlotRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return [];
    }
}
