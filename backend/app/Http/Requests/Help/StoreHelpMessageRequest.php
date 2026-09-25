<?php

namespace App\Http\Requests\Help;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Kazda zalogowana, aktywna osoba moze wyslac wiadomosc z okna pomocy —
 * autoryzacje daje juz middleware trasy (`auth:keycloak`, `access.active`),
 * wiec tu bez dodatkowej bramki rolowej.
 *
 * `role` i `user_id` celowo NIE sa tu regula walidacji: nawet gdy przyjda
 * w ciele zadania, `validated()` ich nie zwroci. Obie wartosci kontroler
 * bierze wylacznie z tokena biezacego zadania (`TokenRoles`, `$request
 * ->user()`), nigdy z ciala.
 */
class StoreHelpMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'content' => ['required', 'string', 'min:1', 'max:2000'],
            'screen' => ['required', 'string', 'min:1', 'max:200'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('content'))) {
            $this->merge(['content' => trim($this->input('content'))]);
        }

        if (is_string($this->input('screen'))) {
            $this->merge(['screen' => trim($this->input('screen'))]);
        }
    }

    public function messages(): array
    {
        return [
            'content.required' => 'Wpisz tresc wiadomosci.',
            'content.min' => 'Wpisz tresc wiadomosci.',
            'content.max' => 'Wiadomosc moze miec maksymalnie 2000 znakow.',
            'screen.required' => 'Brak informacji o ekranie, z ktorego wyslano zgloszenie.',
            'screen.min' => 'Brak informacji o ekranie, z ktorego wyslano zgloszenie.',
            'screen.max' => 'Nazwa ekranu jest za dluga (maksymalnie 200 znakow).',
        ];
    }
}
