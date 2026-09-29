<?php

namespace App\Http\Requests\H08;

use App\Models\Course;
use App\Services\H08\TopicScope;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Trasy tematów zawieszone na kursie (`…/courses/{course}/topics…`).
 * `authorize()` odnajduje kurs w zasięgu wywołującego (`TopicScope`) PRZED
 * walidacją ciała: kurs spoza zasięgu i kurs nieistniejący dają ten sam
 * wyjątek 404, niezależnie od treści żądania. Zła rola odpada wcześniej,
 * na middleware `role:` trasy.
 *
 * Sama klasa (bez reguł) obsługuje `GET …/topics`; klasy pochodne dokładają
 * reguły ciała.
 */
class CourseTopicRequest extends FormRequest
{
    private ?Course $scopedCourse = null;

    public function authorize(): bool
    {
        $this->scopedCourse = $this->topicScope()->course($this->route('course'));

        return true;
    }

    public function rules(): array
    {
        return [];
    }

    public function scopedCourse(): Course
    {
        return $this->scopedCourse ??= $this->topicScope()->course($this->route('course'));
    }

    protected function topicScope(): TopicScope
    {
        return TopicScope::admin();
    }
}
