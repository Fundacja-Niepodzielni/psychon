<?php

namespace App\Http\Requests\H22;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /admin/legal-documents/{type}/versions — nowy szkic. Limit treści
 * (20000 znaków) odpowiada objętości pełnego regulaminu/polityki w Markdown
 * z zapasem — ogranicza to, co trafia do bazy i do publicznego odczytu,
 * bez obcinania realnego dokumentu prawnego.
 */
class StoreLegalDocumentVersionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'version' => [
                'required',
                'string',
                'max:32',
                Rule::unique('legal_document_versions', 'version')
                    ->where(fn ($query) => $query->where('type', $this->route('type'))),
            ],
            'content' => ['required', 'string', 'max:20000'],
        ];
    }
}
