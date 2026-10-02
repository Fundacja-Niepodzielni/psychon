<?php

namespace App\Support\H10;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\Test;
use App\Models\User;
use App\Support\CourseAccess;

/**
 * Pakiet H10 · zaliczony test jest zamknięty.
 *
 * Osoba z zaliczonym podejściem nie zaczyna nowego — 403 `test_already_passed`. Zaliczenie
 * rozstrzyga wyłącznie `CourseAccess::testPassed` (to samo źródło co ścieżka
 * kursów, certyfikat i liczniki); kurs ma najwyżej jeden test (unikat
 * `tests.course_id`), więc zaliczenie kursu jest zaliczeniem tego testu.
 *
 * Wołać pod blokadą wiersza użytkownika, pod którą potem coś się zapisuje albo
 * kasuje — inaczej równoległe żądanie zaliczające minęłoby sprawdzenie.
 */
final class PassedTestGuard
{
    public static function assertNotPassed(User $user, Test $test): void
    {
        $course = $test->course;

        if ($course instanceof Course && CourseAccess::testPassed($user, $course)) {
            throw new ApiException(403, 'test_already_passed', 'Ten test jest już zaliczony.');
        }
    }
}
