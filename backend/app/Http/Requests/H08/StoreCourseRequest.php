<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /admin/courses — utworzenie kursu. Nowy kurs powstaje jako szkic:
 * niepublikowany kurs jest przezroczysty dla reguły odblokowań
 * (`CourseAccess::state()` filtruje poprzednika po `is_published`).
 */
class StoreCourseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'alpha_dash', 'max:255', Rule::unique('courses', 'slug')],
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
            'title.required' => 'Podaj tytuł kursu.',
            'title.max' => 'Tytuł kursu może mieć najwyżej 255 znaków.',
            'slug.required' => 'Podaj identyfikator (slug) kursu.',
            'slug.alpha_dash' => 'Slug może zawierać wyłącznie litery, cyfry, myślniki i podkreślenia.',
            'slug.unique' => 'Kurs o takim slugu już istnieje.',
            'type.in' => 'Nieznany typ kursu.',
            'product_group.in' => 'Nieznana grupa produktowa.',
            'sequence_order.min' => 'Pozycja w ścieżce musi być liczbą co najmniej 1.',
            'is_published.boolean' => 'Pole publikacji przyjmuje wartość prawda/fałsz.',
        ];
    }
}
