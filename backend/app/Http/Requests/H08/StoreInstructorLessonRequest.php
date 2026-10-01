<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;
use App\Rules\RecordingAssignedByAdministration;

/**
 * POST /instructor/courses/{course}/lessons — sama walidacja co
 * `StoreLessonRequest` (panel administracji), ale `authorize()`
 * (`AuthorizesAgainstAssignedCourse`) sprawdza przypisanie prowadzącego
 * przez `CoursePolicy` PRZED walidacją ciała — patrz opis cechy.
 *
 * Nagranie do lekcji przypisuje administracja, więc nowa lekcja prowadzącego
 * nie może go nieść: pole `video_provider_id` jest nieobecne albo puste
 * (`RecordingAssignedByAdministration`). Reguła zastępuje regułę kształtu
 * z klasy bazowej — każdy inny przypadek ma jedno zdanie odmowy.
 */
class StoreInstructorLessonRequest extends StoreLessonRequest
{
    use AuthorizesAgainstAssignedCourse;

    public function rules(): array
    {
        return [
            ...parent::rules(),
            'video_provider_id' => ['sometimes', new RecordingAssignedByAdministration(null)],
        ];
    }
}
