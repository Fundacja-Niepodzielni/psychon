<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class ImportApplicationsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
        ];
    }
}
