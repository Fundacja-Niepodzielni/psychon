<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H08 · jedyne miejsce nadające pozycje 1..N lekcjom kursu i kursom
 * ścieżki.
 *
 * `courses.sequence_order` nie ma w bazie unikalności
 * (`2026_01_01_000040_create_courses_tables.php:22` — `nullable()->index()`),
 * a `CourseAccess::state()` wybiera poprzednika właśnie po tej kolumnie:
 * duplikat czyni ten wybór niedeterministycznym. Dlatego renumeracja obejmuje
 * **cały** zbiór, nie tylko przestawiane elementy, i dlatego żądanie musi być
 * pełną permutacją identyfikatorów.
 *
 * `ReorderImpactPreview` woła dokładnie te same metody renumeracji — inaczej
 * podgląd zapowiadałby coś innego, niż zrobi realny reorder.
 */
final class SequenceReorderer
{
    /**
     * @param  list<int>  $lessonIds
     * @return Collection<int, Lesson>
     */
    public static function reorderLessons(Course $course, array $lessonIds, User $actor): Collection
    {
        self::assertFullPermutation(
            self::lessonIdsOf($course),
            $lessonIds,
            'lesson_ids',
            'wszystkie lekcje tego kursu',
        );

        return DB::transaction(function () use ($course, $lessonIds, $actor): Collection {
            self::renumberLessons($lessonIds);

            // Rejestr audytu §3.2 nie ma slugów dla lekcji — operacje podrzędne
            // mapujemy na `course.updated` z opisem w `details`.
            AuditLog::record($actor, 'course.updated', $course, [
                'op' => 'lessons.reordered',
                'lesson_ids' => $lessonIds,
            ]);

            return self::lessonsOf($course);
        });
    }

    /**
     * @param  list<int>  $courseIds
     * @return Collection<int, Course>
     */
    public static function reorderCourses(array $courseIds, User $actor): Collection
    {
        self::assertCoursePermutation($courseIds);

        return DB::transaction(function () use ($courseIds, $actor): Collection {
            self::renumberCourses($courseIds);

            // Przestawienie ścieżki nie ma pojedynczego podmiotu — identyfikatory
            // w kolejności docelowej niosą pełną treść zdarzenia.
            AuditLog::record($actor, 'course.updated', null, [
                'op' => 'courses.reordered',
                'course_ids' => $courseIds,
            ]);

            return self::pathCourses();
        });
    }

    /**
     * Identyfikatory kursów ścieżki (`sequence_order IS NOT NULL`) w obecnej
     * kolejności. Szkice też zajmują pozycję i muszą być renumerowane.
     *
     * @return list<int>
     */
    public static function pathCourseIds(): array
    {
        return self::pathQuery()
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * @param  list<int>  $courseIds
     */
    public static function assertCoursePermutation(array $courseIds): void
    {
        self::assertFullPermutation(
            self::pathCourseIds(),
            $courseIds,
            'course_ids',
            'wszystkie kursy ścieżki',
        );
    }

    /**
     * Nadaje pozycje 1..N w kolejności przekazanej listy. Brak unikalności na
     * kolumnie sprawia, że przejściowe duplikaty w trakcie pętli są legalne —
     * po jej zakończeniu zbiór jest znowu spójny.
     *
     * @param  list<int>  $courseIds
     */
    public static function renumberCourses(array $courseIds): void
    {
        foreach ($courseIds as $index => $id) {
            Course::query()->whereKey($id)->update(['sequence_order' => $index + 1]);
        }
    }

    /**
     * @param  list<int>  $lessonIds
     */
    public static function renumberLessons(array $lessonIds): void
    {
        foreach ($lessonIds as $index => $id) {
            Lesson::query()->whereKey($id)->update(['sequence_order' => $index + 1]);
        }
    }

    /**
     * @return Collection<int, Course>
     */
    public static function pathCourses(): Collection
    {
        return self::pathQuery()->withCount(['lessons', 'materials'])->get();
    }

    private static function pathQuery(): Builder
    {
        return Course::query()
            ->whereNotNull('sequence_order')
            ->orderBy('sequence_order')
            ->orderBy('id');
    }

    /**
     * @return Collection<int, Lesson>
     */
    private static function lessonsOf(Course $course): Collection
    {
        return self::lessonQuery($course)->withCount('materials')->get();
    }

    /**
     * @return list<int>
     */
    private static function lessonIdsOf(Course $course): array
    {
        return self::lessonQuery($course)
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    private static function lessonQuery(Course $course): Builder
    {
        return Lesson::query()
            ->where('course_id', $course->id)
            ->orderBy('sequence_order')
            ->orderBy('id');
    }

    /**
     * Lista musi być pełną permutacją zbioru: brak elementu zostawiłby po
     * renumeracji duplikat pozycji, a nadmiar wciągnąłby do ścieżki coś,
     * czego w niej nie ma.
     *
     * @param  list<int>  $current
     * @param  list<int>  $given
     */
    private static function assertFullPermutation(array $current, array $given, string $field, string $what): void
    {
        $expected = $current;
        $actual = $given;

        sort($expected);
        sort($actual);

        if ($expected === $actual) {
            return;
        }

        throw new ApiException(
            422,
            'validation_failed',
            'Popraw zaznaczone pola.',
            errors: [
                $field => ['Lista musi zawierać '.$what.' — każdy dokładnie raz, bez pominięć i obcych identyfikatorów.'],
            ],
        );
    }
}
