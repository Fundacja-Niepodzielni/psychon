<?php

namespace App\Http\Requests\H08;

/**
 * POST …/courses/{course}/topics — nowy temat na końcu kursu.
 */
class StoreTopicRequest extends CourseTopicRequest
{
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Podaj tytuł tematu.',
            'title.string' => 'Tytuł tematu musi być tekstem.',
            'title.max' => 'Tytuł tematu może mieć najwyżej 255 znaków.',
        ];
    }
}
