<?php

namespace App\Http\Requests\H16;

use App\Support\NotificationTypes;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateNotificationPreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // every signed-in person manages only their own preferences
    }

    public function rules(): array
    {
        return [
            'preferences' => ['required', 'array', 'min:1'],
            'preferences.*' => ['required', 'array:type,email'],
            'preferences.*.type' => ['required', 'string', 'distinct', Rule::in(NotificationTypes::ALL)],
            'preferences.*.email' => ['required', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'preferences.required' => 'Podaj co najmniej jedną preferencję.',
            'preferences.array' => 'Preferencje muszą być listą.',
            'preferences.min' => 'Podaj co najmniej jedną preferencję.',
            'preferences.*.array' => 'Każda preferencja musi mieć tylko pola typu i e-maila.',
            'preferences.*.type.required' => 'Podaj typ powiadomienia.',
            'preferences.*.type.distinct' => 'Typ powiadomienia powtarza się na liście.',
            'preferences.*.type.in' => 'Nieznany typ powiadomienia.',
            'preferences.*.email.required' => 'Określ, czy wysyłać e-mail.',
            'preferences.*.email.boolean' => 'Pole e-mail musi mieć wartość tak albo nie.',
        ];
    }
}
