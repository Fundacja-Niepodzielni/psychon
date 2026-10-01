<?php

namespace App\Http\Requests\DocumentTemplates;

use App\Rules\SafeDocumentTemplate;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /document-templates/{type} - nowa tresc wzoru. Rola egzekwowana przez
 * middleware `role:project_manager,super_admin` (routes/api/document_templates.php).
 */
class UpdateDocumentTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'content' => ['required', 'string', 'min:1', 'max:200000', new SafeDocumentTemplate],
        ];
    }
}
