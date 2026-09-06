<?php

namespace App\Http\Requests\H17;

use Illuminate\Foundation\Http\FormRequest;

class StoreLessonQuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['volunteer', 'student'], true);
    }

    /**
     * Only `question` is an input. `user_id`, `lesson_id` and every answer field
     * come from the route and the session, never from the body.
     */
    public function rules(): array
    {
        return [
            'question' => ['required', 'string', 'min:1', 'max:2000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('question'))) {
            $this->merge(['question' => trim($this->input('question'))]);
        }
    }

    public function messages(): array
    {
        return [
            'question.required' => 'Wpisz treść pytania.',
            'question.max' => 'Pytanie może mieć maksymalnie 2000 znaków.',
        ];
    }
}
