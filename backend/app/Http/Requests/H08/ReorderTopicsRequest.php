<?php

namespace App\Http\Requests\H08;

/**
 * PATCH …/courses/{course}/topics/reorder — cały układ kursu jednym
 * żądaniem: tematy w nowej kolejności, a w każdym lekcje w nowej kolejności.
 * Tu żyją wyłącznie reguły pól; to, że lista jest pełną permutacją tematów
 * i lekcji kursu, sprawdza `TopicWriter::reorder`, bo potrzebuje kontekstu
 * kursu.
 */
class ReorderTopicsRequest extends CourseTopicRequest
{
    public function rules(): array
    {
        return [
            'topics' => ['required', 'array', 'min:1'],
            'topics.*' => ['array:id,lesson_ids'],
            'topics.*.id' => ['required', 'integer', 'distinct'],
            'topics.*.lesson_ids' => ['present', 'array'],
            'topics.*.lesson_ids.*' => ['integer', 'distinct'],
        ];
    }

    public function messages(): array
    {
        return [
            'topics.required' => 'Podaj nową kolejność tematów.',
            'topics.array' => 'Kolejność tematów musi być listą.',
            'topics.min' => 'Podaj co najmniej jeden temat.',
            'topics.*.array' => 'Każdy temat podaj jako identyfikator i listę lekcji.',
            'topics.*.id.required' => 'Podaj identyfikator tematu.',
            'topics.*.id.integer' => 'Identyfikator tematu musi być liczbą całkowitą.',
            'topics.*.id.distinct' => 'Każdy temat może wystąpić w kolejności tylko raz.',
            'topics.*.lesson_ids.present' => 'Podaj listę lekcji tematu (może być pusta).',
            'topics.*.lesson_ids.array' => 'Lekcje tematu podaj jako listę identyfikatorów.',
            'topics.*.lesson_ids.*.integer' => 'Identyfikator lekcji musi być liczbą całkowitą.',
            'topics.*.lesson_ids.*.distinct' => 'Każda lekcja może wystąpić w kolejności tylko raz.',
        ];
    }

    /**
     * @return list<array{id: int, lesson_ids: list<int>}>
     */
    public function layout(): array
    {
        return array_values(array_map(
            static fn (array $topic): array => [
                'id' => (int) $topic['id'],
                'lesson_ids' => array_values(array_map(
                    static fn ($id): int => (int) $id,
                    (array) $topic['lesson_ids'],
                )),
            ],
            (array) $this->validated('topics'),
        ));
    }
}
