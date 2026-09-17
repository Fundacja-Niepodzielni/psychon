<?php

namespace App\Http\Requests\H22;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PATCH /admin/legal-documents/{type}/versions/{version} — edycja szkicu.
 * Kontroler odmawia (403) zanim ta walidacja w ogóle wejdzie w grę, gdy
 * wersja jest już opublikowana — ta klasa nie zna stanu rekordu.
 */
class UpdateLegalDocumentVersionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'version' => [
                'sometimes',
                'required',
                'string',
                'max:32',
                Rule::unique('legal_document_versions', 'version')
                    ->where(fn ($query) => $query->where('type', $this->route('type')))
                    ->ignore($this->route('version'), 'version'),
            ],
            'content' => ['sometimes', 'required', 'string', 'max:20000'],
        ];
    }
}
