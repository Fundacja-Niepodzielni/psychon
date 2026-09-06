<?php

namespace App\Http\Requests\H08;

use App\Models\Course;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PATCH /admin/courses/{course} — częściowa aktualizacja kursu. Każde pole
 * z `sometimes`, żeby żądanie zmieniające jedną kolumnę nie wymuszało
 * przesłania całego zasobu. Reguła „publikacja wymaga lekcji" nie żyje tutaj
 * — potrzebuje stanu po złożeniu zmian i jest w `CourseWriter`.
 */
class UpdateCourseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        $course = $this->route('course');

        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'slug' => [
                'sometimes',
                'string',
                'alpha_dash',
                'max:255',
                Rule::unique('courses', 'slug')->ignore($course instanceof Course ? $course->id : null),
            ],
            'description' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', 'string', Rule::in(['course', 'webinar'])],
            'product_group' => ['sometimes', 'string', Rule::in(['psychon', 'dobrostan', 'both'])],
            'sequence_order' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'is_published' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.max' => 'Tytuł kursu może mieć najwyżej 255 znaków.',
            'slug.alpha_dash' => 'Slug może zawierać wyłącznie litery, cyfry, myślniki i podkreślenia.',
            'slug.unique' => 'Kurs o takim slugu już istnieje.',
            'type.in' => 'Nieznany typ kursu.',
            'product_group.in' => 'Nieznana grupa produktowa.',
            'sequence_order.min' => 'Pozycja w ścieżce musi być liczbą co najmniej 1.',
            'is_published.boolean' => 'Pole publikacji przyjmuje wartość prawda/fałsz.',
        ];
    }
}
