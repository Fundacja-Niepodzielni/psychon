<?php

namespace App\Http\Requests\H03;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class ViewDiplomaScanRequest extends FormRequest
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
