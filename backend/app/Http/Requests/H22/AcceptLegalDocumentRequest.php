<?php

namespace App\Http\Requests\H22;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /legal-documents/{type}/accept — osoba wskazuje wersję, którą
 * właśnie zaakceptowała (ta, którą widziała na ekranie). Kontroler
 * porównuje ją z bieżącą opublikowaną wersją rodzaju — niezgodność
 * (dokument zmienił się między wczytaniem ekranu a wysłaniem) → 422.
 */
class AcceptLegalDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // dostęp: dowolna zalogowana osoba (middleware `auth:keycloak`)
    }

    public function rules(): array
    {
        return [
            'version' => ['required', 'string', 'max:32'],
        ];
    }
}
