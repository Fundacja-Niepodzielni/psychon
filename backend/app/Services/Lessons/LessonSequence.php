<?php

namespace App\Services\Lessons;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use App\Queries\CourseCatalogQuery;
use Illuminate\Support\Collection;

/**
 * Jedyna implementacja reguły „lekcje po kolei” (wzorem `CourseAccess`):
 * trasy uczestnika i odczyt kursu wołają ją, żadna nie powtarza warunku.
 *
 * Kolejność lekcji jest ta sama co w odczycie kursu: płaska lista
 * `sequence_order` (tematy rosnąco, w nich lekcje; kolejność spłaszczona
 * przez zaplecze). Lekcja jest OTWARTA dla uczestnika, gdy:
 *  1. jest pierwszą lekcją kursu, albo
 *  2. poprzednia lekcja w tej kolejności jest ukończona, albo
 *  3. sama jest ukończona (ukończona zostaje otwarta zawsze — także po
 *     zmianie kolejności lekcji po publikacji).
 * W przeciwnym razie lekcja jest zamknięta: 403 `lesson_locked`. Sam postęp
 * (bez ukończenia) lekcji nie otwiera.
 *
 * Reguła dotyczy wyłącznie uczestnika (rola wolontariusza albo studenta
 * z tokena — ta sama miara co `completed` w odczycie kursu); personel
 * i prowadzący jej nie podlegają.
 *
 * Z testem kursu: kurs, który ma lekcje, otwiera test dopiero po ukończeniu
 * ich wszystkich (`conditions_not_met`, `missing: ["lessons"]`). Kurs bez
 * lekcji nie zamyka testu.
 */
final class LessonSequence
{
    /**
     * @param  list<string>  $roles  role z tokena bieżącego żądania
     */
    public static function appliesTo(array $roles): bool
    {
        return CourseCatalogQuery::isParticipant($roles);
    }

    /**
     * Wspólny rdzeń: dla każdej zamkniętej lekcji — lekcja, którą trzeba
     * ukończyć (poprzednia w kolejności kursu).
     *
     * @param  Collection<int, Lesson>  $ordered  lekcje kursu w kolejności odczytu kursu
     * @param  list<int>  $completedIds  ukończone przez osobę
     * @return array<int, array{id: int, title: string, number: int}> id lekcji zamkniętej → wymagana poprzednia
     */
    public static function blockers(Collection $ordered, array $completedIds): array
    {
        $blockers = [];
        $previous = null;

        foreach ($ordered->values() as $index => $lesson) {
            if ($previous !== null
                && ! in_array($lesson->id, $completedIds, true)
                && ! in_array($previous->id, $completedIds, true)) {
                $blockers[$lesson->id] = [
                    'id' => $previous->id,
                    'title' => $previous->title,
                    'number' => $index, // numer poprzedniej lekcji w kursie (od 1)
                ];
            }

            $previous = $lesson;
        }

        return $blockers;
    }

    /**
     * Czy test kursu jest zamknięty: kurs ma test i lekcje, a nie wszystkie
     * lekcje są ukończone.
     *
     * @param  Collection<int, Lesson>  $ordered
     * @param  list<int>  $completedIds
     */
    public static function testLocked(bool $hasTest, Collection $ordered, array $completedIds): bool
    {
        return $hasTest && self::lessonsMissing($ordered, $completedIds);
    }

    /**
     * @throws ApiException 403 `lesson_locked`
     */
    public static function assertOpen(User $user, Lesson $lesson): void
    {
        $ordered = self::orderedLessons($lesson->course_id);
        $blockers = self::blockers($ordered, self::completedIds($user, $ordered));

        if (isset($blockers[$lesson->id])) {
            $blocker = $blockers[$lesson->id];

            throw new ApiException(
                403,
                'lesson_locked',
                "Najpierw ukończ lekcję {$blocker['number']}: {$blocker['title']}.",
                reason: ['required_lesson_id' => $blocker['id']],
            );
        }
    }

    /**
     * @throws ApiException 422 `conditions_not_met`
     */
    public static function assertTestOpen(User $user, Course $course): void
    {
        $ordered = self::orderedLessons($course->id);

        if (self::lessonsMissing($ordered, self::completedIds($user, $ordered))) {
            throw new ApiException(
                422,
                'conditions_not_met',
                'Ukończ wszystkie lekcje kursu, zanim przejdziesz do testu.',
                reason: ['missing' => ['lessons']],
            );
        }
    }

    /**
     * @param  Collection<int, Lesson>  $ordered
     * @param  list<int>  $completedIds
     */
    private static function lessonsMissing(Collection $ordered, array $completedIds): bool
    {
        return $ordered->isNotEmpty()
            && $ordered->contains(fn (Lesson $lesson): bool => ! in_array($lesson->id, $completedIds, true));
    }

    /**
     * @return Collection<int, Lesson>
     */
    private static function orderedLessons(int $courseId): Collection
    {
        return Lesson::query()
            ->where('course_id', $courseId)
            ->orderBy('sequence_order')
            ->orderBy('id')
            ->get(['id', 'title', 'sequence_order']);
    }

    /**
     * @param  Collection<int, Lesson>  $ordered
     * @return list<int>
     */
    private static function completedIds(User $user, Collection $ordered): array
    {
        return LessonProgress::query()
            ->where('user_id', $user->id)
            ->whereIn('lesson_id', $ordered->pluck('id'))
            ->where('is_completed', true)
            ->pluck('lesson_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }
}
