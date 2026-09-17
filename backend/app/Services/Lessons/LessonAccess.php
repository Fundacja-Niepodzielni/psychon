<?php

namespace App\Services\Lessons;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use App\Queries\CourseCatalogQuery;
use App\Services\Auth\TokenRoles;
use App\Support\CourseAccess;

/**
 * Jedna reguła dostępu do treści kursu dla tras uczestnika: lekcja (treść,
 * postęp, pytania do prowadzącego, link do nagrania), test kursu i historia
 * prób.
 *
 * Kolejność jest istotna:
 * 1. Widoczność kursu. Punktem wyjścia jest to samo zapytanie co katalog
 *    kursów (`CourseCatalogQuery::visibleTo`, role z bieżącego tokena), ale
 *    katalog odpowiada na pytanie „co pokazać na liście” i dla uczestników
 *    (wolontariusz, student) zawęża ją dodatkowo kolejnością w ścieżce
 *    (`sequence_order`) — wolontariusz widzi tylko trasę szkolenia, student
 *    tylko kursy spoza niej. To zawężenie jest właściwe dla listy, ale jako
 *    reguła DOSTĘPU odbierałoby uczestnikowi kurs spoza jego zwykłego
 *    zakresu (zaproszenie, webinar), do którego ma jawne przypisanie przez
 *    przynależność do tej samej grupy produktowej — dostęp, jaki miał
 *    zawsze (patrz `App\Services\H08\CourseInviter`: zaproszenie jest tylko
 *    powiadomieniem, nie ma osobnej tabeli zaproszeń — dostęp już istnieje
 *    przez grupę produktową). Dlatego dla uczestnika kurs poza katalogiem
 *    jest mimo to widoczny, gdy jest opublikowany i należy do jego grupy
 *    produktowej (`assignedByProductGroup`). Kurs poza zasięgiem osoby (inna
 *    grupa produktowa, nieopublikowany) odpowiada 404 tak jak zasób
 *    nieistniejący, więc odpowiedź nie zdradza, że kurs istnieje (także gdy
 *    byłby zablokowany).
 *
 *    Wyjątek dla personelu jest zawężony do dwóch ról administracyjnych
 *    (kierownik projektu, administrator) — one widzą KAŻDY kurs, także
 *    nieopublikowany, bez zmian. Prowadzący (`instructor`) NIE dostaje
 *    pełnego zwolnienia: bez związku z kursem (ani przez grupę produktową,
 *    ani przez rekord `CourseAssignment`) reguła traktuje go jak uczestnika
 *    bez dostępu — 404. Prowadzący przypisany do kursu (przez grupę albo
 *    wprost) widzi go NAWET nieopublikowany — podgląd przed publikacją jest
 *    tu celowo zachowany (`assignedAsInstructor`).
 * 2. Kolejność kursów w ścieżce — wyłącznie `CourseAccess::state`; widoczny,
 *    ale zablokowany kurs daje dotychczasowe 403 `course_locked`.
 */
final class LessonAccess
{
    /** Role administracyjne: widzą każdy kurs, także nieopublikowany. */
    private const ADMIN_ROLES = ['project_manager', 'super_admin'];

    public function __construct(private readonly TokenRoles $tokenRoles) {}

    /**
     * Zwraca kurs lekcji, gdy osoba ma do niej dostęp; w przeciwnym razie
     * rzuca 404 `not_found` albo 403 `course_locked`.
     *
     * @throws ApiException
     */
    public function authorize(User $user, Lesson $lesson): Course
    {
        return $this->authorizeLesson($user, $lesson, 'Nie znaleziono lekcji.', staffExempt: true);
    }

    /**
     * Link do nagrania: widoczność kursu obowiązuje tu także personel, tak jak
     * przed wprowadzeniem wspólnej reguły (link wydawano tylko dla kursów
     * z katalogu wywołującego).
     *
     * @throws ApiException
     */
    public function authorizeRecording(User $user, Lesson $lesson): Course
    {
        return $this->authorizeLesson($user, $lesson, 'Nie znaleziono zasobu.', staffExempt: false);
    }

    /**
     * Ta sama reguła dla zasobu przypiętego wprost do kursu (test kursu):
     * najpierw widoczność (404), potem kolejność (403).
     *
     * @throws ApiException
     */
    public function authorizeCourse(User $user, ?Course $course, string $lockedMessage): Course
    {
        $this->assertVisible($user, $course, 'Nie znaleziono zasobu.');
        $this->assertUnlocked($user, $course, $lockedMessage);

        return $course;
    }

    /**
     * Sam krok widoczności — dla miejsc, które muszą odmówić, zanim cokolwiek
     * innego (np. walidacja treści żądania) zdradzi istnienie kursu.
     *
     * @phpstan-assert Course $course
     *
     * @throws ApiException
     */
    public function assertVisible(User $user, ?Course $course, string $notFoundMessage, bool $staffExempt = true): void
    {
        if (! $course instanceof Course) {
            throw new ApiException(404, 'not_found', $notFoundMessage);
        }

        if ($staffExempt && $this->tokenRoles->has(...self::ADMIN_ROLES)) {
            return;
        }

        if ($staffExempt && $this->tokenRoles->has('instructor')) {
            if (self::assignedAsInstructor($user, $course)) {
                return;
            }

            throw new ApiException(404, 'not_found', $notFoundMessage);
        }

        if (! $this->visible($user, $course)) {
            throw new ApiException(404, 'not_found', $notFoundMessage);
        }
    }

    /**
     * @see assertVisible dla wyjaśnienia, dlaczego katalog sam nie wystarcza
     * jako reguła dostępu dla uczestników (wolontariusz, student).
     */
    private function visible(User $user, Course $course): bool
    {
        $roles = $this->tokenRoles->current();

        if (CourseCatalogQuery::visibleTo($user, $roles)->whereKey($course->id)->exists()) {
            return true;
        }

        if (! CourseCatalogQuery::isParticipant($roles)) {
            return false;
        }

        return $course->is_published && self::assignedByProductGroup($user, $course);
    }

    /**
     * Jawne przypisanie do kursu przez grupę produktową — ten sam warunek,
     * którym `CourseCatalogQuery::visibleTo` zawęża katalog dla każdej roli,
     * ale bez dodatkowego podziału na ścieżkę (wolontariusz) czy brak ścieżki
     * (student), bo ten podział odpowiada na pytanie o listę, nie o wejście.
     */
    private static function assignedByProductGroup(User $user, Course $course): bool
    {
        if ($user->product_group === 'both') {
            return true;
        }

        return in_array($course->product_group, [$user->product_group, 'both'], true);
    }

    /**
     * Prowadzący ma związek z kursem „przez grupę albo wprost”: albo ta sama
     * grupa produktowa co reszta uczestników, albo jawny rekord
     * `CourseAssignment` (przydział, niezależnie od grupy). Publikacja kursu
     * nie ma tu znaczenia — podgląd przed publikacją jest zamierzony.
     */
    private static function assignedAsInstructor(User $user, Course $course): bool
    {
        if (self::assignedByProductGroup($user, $course)) {
            return true;
        }

        return $course->assignments()
            ->where('instructor_id', $user->id)
            ->whereNull('unassigned_at')
            ->exists();
    }

    /**
     * @throws ApiException
     */
    private function authorizeLesson(User $user, Lesson $lesson, string $notFoundMessage, bool $staffExempt): Course
    {
        $lesson->loadMissing('course');
        $course = $lesson->course instanceof Course ? $lesson->course : null;

        $this->assertVisible($user, $course, $notFoundMessage, $staffExempt);
        $this->assertUnlocked($user, $course, 'Ten kurs jest jeszcze zablokowany.');

        return $course;
    }

    /**
     * @throws ApiException
     */
    private function assertUnlocked(User $user, Course $course, string $lockedMessage): void
    {
        $state = CourseAccess::state($user, $course);

        if ($state['status'] === 'locked') {
            throw new ApiException(
                403,
                'course_locked',
                $lockedMessage,
                reason: [
                    'required_course_id' => $state['required_course_id'] ?? null,
                    'missing' => $state['missing'],
                ],
            );
        }
    }
}
