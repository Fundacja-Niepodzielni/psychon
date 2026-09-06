<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class ViewApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [];
    }
}
