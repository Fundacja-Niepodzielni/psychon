<?php

namespace App\Services\H09;

use App\Models\Course;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * H09 · kursy prowadzone przez prowadzącego = aktywne przypisania kursowe
 * (`course_assignments` z `lesson_id = null` i `unassigned_at = null`).
 * Odwrotny kierunek reguły z {@see AssignmentResolver}, użwany przez wizytówkę
 * i ekran `#/panel/prowadzacy`.
 */
final class InstructorCourses
{
    /**
     * @return Collection<int, Course>
     */
    public static function for(int $instructorId): Collection
    {
        return self::baseQuery([$instructorId])->get();
    }

    /**
     * Kursy pogrupowane po `instructor_id` — jedno zapytanie dla całej strony
     * listy wizytówek.
     *
     * @param  iterable<int>  $instructorIds
     * @return Collection<int, Collection<int, Course>>
     */
    public static function forMany(iterable $instructorIds): Collection
    {
        $ids = collect($instructorIds)->map(fn ($id): int => (int) $id)->unique()->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        return self::baseQuery($ids->all())
            ->addSelect('course_assignments.instructor_id as led_by_instructor_id')
            ->get()
            ->groupBy('led_by_instructor_id');
    }

    /**
     * @param  array<int>  $instructorIds
     * @return Builder<Course>
     */
    private static function baseQuery(array $instructorIds): Builder
    {
        return Course::query()
            ->select('courses.*')
            ->distinct()
            ->join('course_assignments', 'course_assignments.course_id', '=', 'courses.id')
            ->whereIn('course_assignments.instructor_id', $instructorIds)
            ->whereNull('course_assignments.lesson_id')
            ->whereNull('course_assignments.unassigned_at')
            ->orderBy('courses.sequence_order')
            ->orderBy('courses.id');
    }
}
