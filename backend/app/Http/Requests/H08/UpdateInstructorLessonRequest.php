<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;
use App\Models\Course;
use App\Models\Lesson;
use App\Rules\RecordingAssignedByAdministration;

/**
 * PATCH /instructor/lessons/{lesson} — sama walidacja co
 * `UpdateLessonRequest` (panel administracji), ale `authorize()`
 * (`AuthorizesAgainstAssignedCourse`) sprawdza przypisanie prowadzącego do
 * kursu lekcji przez `CoursePolicy` PRZED walidacją ciała — patrz opis
 * cechy. Kurs miękko usunięty nadal jest poprawnym podmiotem sprawdzki
 * (`withTrashed()`), tak samo jak w `InstructorLessonController::authorizeLesson()`.
 *
 * Nagranie do lekcji przypisuje administracja: pole `video_provider_id` jest
 * nieobecne albo równe wartości zapisanej w lekcji (stary edytor odsyła ją przy
 * każdym zapisie), inaczej 422 i kolumna zostaje bez zmian
 * (`RecordingAssignedByAdministration`). Reguła zastępuje regułę kształtu
 * z klasy bazowej — każdy inny przypadek ma jedno zdanie odmowy.
 */
class UpdateInstructorLessonRequest extends UpdateLessonRequest
{
    use AuthorizesAgainstAssignedCourse;

    public function rules(): array
    {
        $lesson = $this->route('lesson');

        return [
            ...parent::rules(),
            'video_provider_id' => [
                'sometimes',
                new RecordingAssignedByAdministration($lesson instanceof Lesson ? $lesson->video_provider_id : null),
            ],
        ];
    }

    protected function resolveCourseForAuthorization(): ?Course
    {
        $lesson = $this->route('lesson');

        return $lesson instanceof Lesson ? $lesson->course()->withTrashed()->first() : null;
    }
}
