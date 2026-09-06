<?php

namespace App\Http\Requests\H11;

use Illuminate\Foundation\Http\FormRequest;

class StoreInternshipEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'volunteer';
    }

    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'hours' => ['required', 'numeric', 'min:0.5', 'max:24', 'multiple_of:0.5'],
            'form' => ['required', 'string', 'in:phone_duty,chat_duty,other'],
            'consultations_count' => ['required', 'integer', 'min:0'],
            'description' => ['sometimes', 'nullable', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'date.date_format' => 'Podaj datę w formacie RRRR-MM-DD.',
            'date.before_or_equal' => 'Data wpisu nie może być późniejsza niż dzisiaj.',
            'hours.numeric' => 'Liczba godzin musi być liczbą.',
            'hours.min' => 'Wpis musi obejmować co najmniej 0,5 godziny.',
            'hours.max' => 'Wpis może obejmować maksymalnie 24 godziny.',
            'hours.multiple_of' => 'Godziny podaj w krokach co 0,5.',
            'form.in' => 'Wybierz dozwoloną formę dyżuru.',
            'consultations_count.integer' => 'Liczba konsultacji musi być całkowita.',
            'consultations_count.min' => 'Liczba konsultacji nie może być ujemna.',
        ];
    }
}
