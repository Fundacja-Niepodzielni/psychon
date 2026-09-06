<?php

namespace App\Services\H08;

use App\Models\Course;
use App\Models\User;
use App\Support\CourseAccess;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Pakiet H08 · „czyje statusy zmieni ta kolejność" — odpowiedź liczona bez
 * reimplementacji reguły odblokowań, której pakietom reimplementować nie
 * wolno (`App\Support\CourseAccess` — zamrożona sygnatura).
 *
 * Mechanika jest celowo kontrintuicyjna (zapis przed odczytem, rollback
 * zamiast commita): stany „przed" liczymy normalnie, potem **ta sama**
 * renumeracja, której używa realny reorder, biegnie wewnątrz transakcji,
 * stany „po" czytamy z już zmienionej bazy, a wyjście z transakcji następuje
 * wyjątkiem `RollbackPreview` — to jedyny sposób, żeby rollback był pewny
 * również przy błędzie w trakcie pomiaru. Endpoint nie zapisuje nic.
 *
 * Zawężenie zakresu jest częścią kontraktu serwisu, nie optymalizacją: bez
 * ograniczenia do kont uczestniczących i do kursów faktycznie zmieniających
 * pozycję liczba wywołań `CourseAccess::state()` rośnie kwadratowo.
 */
final class ReorderImpactPreview
{
    /**
     * @param  list<int>  $courseIds  kursy ścieżki w proponowanej kolejności
     * @return list<array{user_id: int, first_name: string, last_name: string, course_id: int, course_title: string, from: string, to: string}>
     */
    public static function for(array $courseIds): array
    {
        SequenceReorderer::assertCoursePermutation($courseIds);

        // Pobrane przed transakcją: te modele niosą tytuły i kolejność „przed".
        $courses = self::coursesChangingPosition($courseIds);
        $participants = self::participants();

        if ($courses->isEmpty() || $participants->isEmpty()) {
            return [];
        }

        $courseIdsInScope = $courses->pluck('id')->map(static fn ($id): int => (int) $id)->all();

        $before = self::statesFor($participants, $courseIdsInScope);
        $after = null;

        try {
            DB::transaction(function () use ($courseIds, $participants, $courseIdsInScope): void {
                SequenceReorderer::renumberCourses($courseIds);

                throw new RollbackPreview(self::statesFor($participants, $courseIdsInScope));
            });
        } catch (RollbackPreview $rollback) {
            $after = $rollback->states;
        }

        if ($after === null) {
            // Nieosiągalne: domknięcie transakcji zawsze kończy się wyjątkiem.
            // Cichy pusty podgląd byłby gorszy niż błąd — modal by skłamał.
            throw new RuntimeException('Podgląd wpływu nie zmierzył stanu po zmianie kolejności.');
        }

        return self::diff($participants, $courses, $before, $after);
    }

    /**
     * @return Collection<int, User>
     */
    private static function participants(): Collection
    {
        return User::query()
            ->whereIn('role', ['volunteer', 'student'])
            ->where('status', 'active')
            ->orderBy('id')
            ->get();
    }

    /**
     * Kursy, których `sequence_order` faktycznie się zmienia.
     *
     * @param  list<int>  $courseIds
     * @return Collection<int, Course>
     */
    private static function coursesChangingPosition(array $courseIds): Collection
    {
        $currentOrder = Course::query()
            ->whereNotNull('sequence_order')
            ->pluck('sequence_order', 'id');

        $changed = [];

        foreach ($courseIds as $index => $id) {
            if ((int) $currentOrder->get($id) !== $index + 1) {
                $changed[] = (int) $id;
            }
        }

        return Course::query()
            ->whereIn('id', $changed)
            ->orderBy('sequence_order')
            ->orderBy('id')
            ->get();
    }

    /**
     * Kursy są odczytywane świeżo przy każdym pomiarze: `CourseAccess::state()`
     * czyta `sequence_order` z przekazanego modelu, więc pomiar „po" musi lecieć
     * na modelach wczytanych już po renumeracji.
     *
     * @param  Collection<int, User>  $participants
     * @param  list<int>  $courseIds
     * @return array<string, string>
     */
    private static function statesFor(Collection $participants, array $courseIds): array
    {
        $courses = Course::query()->whereIn('id', $courseIds)->get();

        $states = [];

        foreach ($participants as $participant) {
            foreach ($courses as $course) {
                $states[$participant->id.':'.$course->id] = CourseAccess::state($participant, $course)['status'];
            }
        }

        return $states;
    }

    /**
     * @param  Collection<int, User>  $participants
     * @param  Collection<int, Course>  $courses
     * @param  array<string, string>  $before
     * @param  array<string, string>  $after
     * @return list<array{user_id: int, first_name: string, last_name: string, course_id: int, course_title: string, from: string, to: string}>
     */
    private static function diff(Collection $participants, Collection $courses, array $before, array $after): array
    {
        $rows = [];

        foreach ($participants as $participant) {
            foreach ($courses as $course) {
                $key = $participant->id.':'.$course->id;

                if (! isset($before[$key], $after[$key]) || $before[$key] === $after[$key]) {
                    continue;
                }

                $rows[] = [
                    'user_id' => (int) $participant->id,
                    'first_name' => (string) $participant->first_name,
                    'last_name' => (string) $participant->last_name,
                    'course_id' => (int) $course->id,
                    'course_title' => (string) $course->title,
                    'from' => $before[$key],
                    'to' => $after[$key],
                ];
            }
        }

        return $rows;
    }
}
