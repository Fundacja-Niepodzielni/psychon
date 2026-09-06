<?php

namespace App\Http\Requests\H17;

use Illuminate\Foundation\Http\FormRequest;

class AnswerQuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'instructor';
    }

    public function rules(): array
    {
        return [
            'answer' => ['required', 'string', 'min:1', 'max:5000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('answer'))) {
            $this->merge(['answer' => trim($this->input('answer'))]);
        }
    }

    public function messages(): array
    {
        return [
            'answer.required' => 'Wpisz treść odpowiedzi.',
            'answer.max' => 'Odpowiedź może mieć maksymalnie 5000 znaków.',
        ];
    }
}
