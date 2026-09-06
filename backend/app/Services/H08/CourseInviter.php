<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H08 · zaproszenie wskazanych osób na kurs poza główną ścieżką.
 *
 * Zaproszenie jest **wyłącznie powiadomieniem** — nie nadaje dostępu. Tabeli
 * zaproszeń nie ma, a migracje są zamrożone; widoczność kursu spoza sekwencji
 * wynika dziś z roli konta (`CourseCatalogQuery`), nie z rekordu zaproszenia.
 * Ograniczenie jest opisane w `DEMO/H08.md`.
 *
 * Rejestr powiadomień kontraktu §3.1 daje H08 dokładnie jeden typ:
 * `course.invited`. Rejestr audytu §3.2 nie ma slugu dla zaproszenia, więc —
 * tak samo jak przy lekcjach (`LessonWriter`) — operacja zapisuje się jako
 * `course.updated` na kursie, z rodzajem operacji w `details.op`.
 */
final class CourseInviter
{
    /**
     * @param  list<int>  $userIds
     * @return int liczba zaproszonych osób
     */
    public static function invite(Course $course, array $userIds, User $actor): int
    {
        self::assertOutsideMainPath($course);

        return DB::transaction(function () use ($course, $userIds, $actor): int {
            $users = User::query()->whereKey($userIds)->orderBy('id')->get();

            // Jedno wywołanie `Notify::send` tworzy i dzwonek, i symulowany
            // e-mail w skrzynce (`Notify.php`) — pakiet nie pisze e-maila sam.
            foreach ($users as $user) {
                Notify::send(
                    $user,
                    'course.invited',
                    "Zaproszenie na: {$course->title}",
                    'Zapraszamy do udziału. Szczegóły i materiały znajdziesz na stronie kursu.',
                    link: "/panel/kursy/{$course->slug}",
                );
            }

            AuditLog::record($actor, 'course.updated', $course, [
                'op' => 'course.invited',
                'user_ids' => $users->pluck('id')->all(),
            ]);

            return $users->count();
        });
    }

    /**
     * Specyfikacja M4 pkt 6 ogranicza zapraszanie do kursów poza główną
     * ścieżką („np. webinarów"). Kurs ze ścieżki odblokowuje się sekwencyjnie
     * przez `CourseAccess`, więc zaproszenie na niego obiecywałoby dostęp,
     * którego nie nadaje.
     */
    private static function assertOutsideMainPath(Course $course): void
    {
        if ($course->sequence_order === null) {
            return;
        }

        throw new ApiException(
            422,
            'conditions_not_met',
            'Zapraszać można wyłącznie na kursy poza główną ścieżką, na przykład na webinary. Ten kurs stoi na pozycji '.$course->sequence_order.' ścieżki i odblokowuje się kolejnymi etapami.',
            reason: ['sequence_order' => $course->sequence_order],
        );
    }
}
