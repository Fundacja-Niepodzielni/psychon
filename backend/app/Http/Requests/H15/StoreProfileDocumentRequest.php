<?php

namespace App\Http\Requests\H15;

use Illuminate\Foundation\Http\FormRequest;

class StoreProfileDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'volunteer';
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'string', 'in:dyplom,niekaralnosc,inne'],
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.required' => 'Wybierz typ załącznika.',
            'type.in' => 'Wybierz dozwolony typ załącznika.',
            'file.required' => 'Wskaż plik do wgrania.',
            'file.file' => 'Wgraj poprawny plik.',
            'file.mimes' => 'Dozwolone formaty pliku: PDF, JPG, PNG.',
            'file.max' => 'Plik może mieć maksymalnie 10 MB.',
        ];
    }
}
