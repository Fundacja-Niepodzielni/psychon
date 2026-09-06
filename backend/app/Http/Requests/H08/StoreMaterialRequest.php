<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/lessons/{lesson}/materials · POST /admin/courses/{course}/materials
 * — wgranie materiału (multipart).
 *
 * Kryterium ★4 karty pakietu wymaga 422 zarówno dla niedozwolonego typu, jak
 * i dla przekroczonego rozmiaru, więc obie reguły mają własny komunikat.
 *
 * Uwaga wdrożeniowa: `post_max_size` / `upload_max_filesize` w PHP muszą być
 * ≥ 10 MB — przy niższym limicie PHP odrzuca żądanie przed walidacją i klient
 * dostaje pustą odpowiedź zamiast koperty 422.
 */
class StoreMaterialRequest extends FormRequest
{
    /** 10 MB — reguła `max` liczy pliki w kilobajtach. */
    private const int MAX_KILOBYTES = 10240;

    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,ppt,pptx,png,jpg,jpeg', 'max:'.self::MAX_KILOBYTES],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'file.required' => 'Wskaż plik do wgrania.',
            'file.file' => 'Wgraj poprawny plik.',
            'file.mimes' => 'Dozwolone formaty pliku: PDF, DOC, DOCX, PPT, PPTX, PNG, JPG.',
            'file.max' => 'Plik może mieć najwyżej 10 MB.',
            'name.max' => 'Nazwa materiału może mieć najwyżej 255 znaków.',
        ];
    }
}
