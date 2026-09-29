<?php

namespace App\Http\Requests\H08;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /instructor/courses — prowadzący zakłada własny kurs. Lista dozwolonych
 * pól treści jest tożsama z `StoreCourseRequest` (panel administracji),
 * reguły i komunikaty przepisane 1:1. Stan i przypisanie ustawia wyłącznie
 * serwer (`CourseWriter::create`, `InstructorCourseAssignment::assignCreator`)
 * — dlatego każde pole stanu albo przypisania jest tu `prohibited`, nie
 * po prostu pominięte: pominięcie dałoby ciche zignorowanie wejścia,
 * `prohibited` daje jawne `422 validation_failed`, gdy ktoś je jednak wyśle.
 */
class InstructorStoreCourseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:instructor` na trasie
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'alpha_dash', 'max:255', Rule::unique('courses', 'slug')],
            'description' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', 'string', Rule::in(['course', 'webinar'])],

            // Stan kursu — ustawia wyłącznie serwer (zawsze szkic).
            'is_published' => ['prohibited'],

            // Pola przypisania — zakładający zostaje przypisany automatycznie,
            // istniejącą ścieżką H09; żadne z tych pól nie jest wejściem.
            'instructor_id' => ['prohibited'],
            'lesson_id' => ['prohibited'],
            'assigned_by' => ['prohibited'],
            'assigned_at' => ['prohibited'],

            // Zastrzeżone administracji (kolejność i grupa produktowa ścieżki).
            'sequence_order' => ['prohibited'],
            'product_group' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Podaj tytuł kursu.',
            'title.max' => 'Tytuł kursu może mieć najwyżej 255 znaków.',
            'slug.required' => 'Podaj identyfikator (slug) kursu.',
            'slug.alpha_dash' => 'Identyfikator może zawierać wyłącznie litery, cyfry, myślniki i podkreślenia.',
            'slug.unique' => 'Kurs o takim identyfikatorze już istnieje.',
            'type.in' => 'Nieznany typ kursu.',
            'is_published.prohibited' => 'Stan publikacji ustawia serwer.',
            'instructor_id.prohibited' => 'Prowadzącego ustawia serwer.',
            'lesson_id.prohibited' => 'To pole nie jest częścią zakładania kursu.',
            'assigned_by.prohibited' => 'To pole nie jest częścią zakładania kursu.',
            'assigned_at.prohibited' => 'To pole nie jest częścią zakładania kursu.',
            'sequence_order.prohibited' => 'Pozycję w ścieżce ustawia administracja.',
            'product_group.prohibited' => 'Grupę produktową ustawia administracja.',
        ];
    }
}
