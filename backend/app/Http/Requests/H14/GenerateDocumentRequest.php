<?php

namespace App\Http\Requests\H14;

use App\Services\H14\DocumentTypeGate;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GenerateDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(DocumentTypeGate::TYPES)],
        ];
    }

    public function messages(): array
    {
        return [
            'type.required' => 'Podaj typ dokumentu.',
            'type.in' => 'Nieznany typ dokumentu.',
        ];
    }
}
