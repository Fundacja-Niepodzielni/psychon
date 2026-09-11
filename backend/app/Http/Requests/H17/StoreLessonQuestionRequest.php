<?php

namespace App\Http\Requests\H17;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class StoreLessonQuestionRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('volunteer', 'student');
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
            'question.min' => 'Wpisz treść pytania.',
            'question.max' => 'Pytanie może mieć maksymalnie 2000 znaków.',
        ];
    }
}
