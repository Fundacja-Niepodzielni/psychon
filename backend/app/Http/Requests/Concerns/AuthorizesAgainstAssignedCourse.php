<?php

namespace App\Http\Requests\Concerns;

use App\Models\Course;

/**
 * `authorize()` wspólny dla żądań prowadzącego, które zmieniają zasób
 * przypisanego kursu (kurs, lekcja, materiał, test wiedzy) — sprawdza
 * `CoursePolicy` PRZED walidacją ciała, bo `FormRequest::authorize()`
 * biegnie przed `rules()`; bez tej kolejności nieprzypisany prowadzący
 * dostawał kod zależny od tego, czy ciało akurat przechodziło walidację
 * (422 zamiast 403), a pole podlegające regule `unique` działało jak
 * wyrocznia istnienia identyfikatora.
 *
 * Klasa korzystająca z cechy podaje wyłącznie, jak dobrać kurs z trasy —
 * przez `resolveCourseForAuthorization()`. Domyślna implementacja czyta
 * parametr `{course}` wprost; trasy wiszące na innym modelu (lekcja, test)
 * nadpisują tę metodę i schodzą do kursu przez relację.
 */
trait AuthorizesAgainstAssignedCourse
{
    public function authorize(): bool
    {
        $course = $this->resolveCourseForAuthorization();

        return $course !== null && (bool) $this->user()?->can('update', $course);
    }

    protected function resolveCourseForAuthorization(): ?Course
    {
        $course = $this->route('course');

        return $course instanceof Course ? $course : null;
    }
}
