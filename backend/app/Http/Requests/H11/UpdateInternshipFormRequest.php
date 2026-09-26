<?php

namespace App\Http\Requests\H11;

use App\Http\Requests\H11\Concerns\InternshipFormRules;
use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class UpdateInternshipFormRequest extends FormRequest
{
    use InternshipFormRules;

    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('project_manager', 'super_admin');
    }

    public function rules(): array
    {
        return $this->formRules(partial: true, ignoreId: (int) $this->route('id'));
    }
}
