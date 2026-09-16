<?php

namespace App\Http\Requests\H13;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/certificates/{certificate}/revoke — unieważnienie z wymaganym
 * powodem (H13). Tekst swobodny, nie słownik (decyzja tymczasowa, do
 * potwierdzenia przez właściciela produktu). Powód trafia do kolumny
 * `revoked_reason` i do audytu `certificate.revoked` (kontrakt §3.2).
 */
class RevokeCertificateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sekcji sprawdzana middlewarem `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Podaj powód unieważnienia certyfikatu.',
            'reason.string' => 'Powód musi być tekstem.',
            'reason.min' => 'Powód musi mieć co najmniej :min znaków.',
            'reason.max' => 'Powód jest za długi (maksymalnie :max znaków).',
        ];
    }
}
