<?php

namespace App\Http\Requests\H08;

/**
 * PATCH …/topics/{topic} — zmiana tytułu tematu. Pozycję tematu zmienia
 * wyłącznie `PATCH …/courses/{course}/topics/reorder`.
 */
class UpdateTopicRequest extends TopicRequest
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
