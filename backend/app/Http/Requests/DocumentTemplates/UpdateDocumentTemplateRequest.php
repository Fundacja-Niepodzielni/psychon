<?php

namespace App\Http\Requests\DocumentTemplates;

use App\Models\DocumentTemplate;
use App\Services\DocumentTemplates\DocumentTemplateFields;
use App\Services\DocumentTemplates\DocumentTemplateTrial;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /document-templates/{type} - nowa tresc wzoru. Rola egzekwowana przez
 * middleware `role:project_manager,super_admin` (routes/api/document_templates.php).
 *
 * Tresc wzoru to tekst z miejscami na pola z zamknietej listy rodzaju
 * (`DocumentTemplateFields`). Wszystko, co wyglada jak skladnia szablonu albo
 * kod, jest odrzucane tutaj, zanim cokolwiek zostanie zapisane.
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
            'content' => [
                'bail',
                'required',
                'string',
                'min:1',
                'max:'.DocumentTemplateFields::MAX_CONTENT_LENGTH,
                function (string $attribute, mixed $value, Closure $fail): void {
                    $type = (string) $this->route('type');

                    // Nieznany rodzaj konczy sie w kontrolerze odpowiedzia 404.
                    if (! in_array($type, DocumentTemplate::TYPES, true)) {
                        return;
                    }

                    $violation = DocumentTemplateFields::violation($type, (string) $value);

                    if ($violation !== null) {
                        $fail($violation);

                        return;
                    }

                    // Reguła pól przeszła - ostatnie słowo ma silnik: próbne
                    // generowanie z danymi przykładowymi, zanim cokolwiek zostanie zapisane.
                    if (! DocumentTemplateTrial::generates($type, (string) $value)) {
                        $fail(DocumentTemplateTrial::FAILURE_MESSAGE);
                    }
                },
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'content.required' => 'Podaj treść wzoru.',
            'content.string' => 'Treść wzoru musi być tekstem.',
            'content.min' => 'Podaj treść wzoru.',
            'content.max' => 'Treść wzoru może mieć najwyżej 20 000 znaków.',
        ];
    }
}
