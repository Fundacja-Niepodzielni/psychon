<?php

namespace App\Services\H08;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H08 · zapis lekcji, domyślna numeracja i audyt. Kontroler zostaje
 * cienki, tak samo jak przy kursach (`CourseWriter`).
 *
 * Rejestr audytu kontraktu §3.2 nie ma slugów dla lekcji, a pisać wolno
 * wyłącznie slugami z rejestru — każda operacja na lekcji zapisuje się więc
 * jako `course.updated` na KURSIE, z rodzajem operacji w `details.op`.
 */
final class LessonWriter
{
    /**
     * @param  array<string, mixed>  $validated
     */
    public static function create(Course $course, array $validated, User $actor): Lesson
    {
        return DB::transaction(function () use ($course, $validated, $actor): Lesson {
            $attributes = self::attributes($validated);
            $attributes['sequence_order'] ??= self::nextSequenceOrder($course);

            $lesson = $course->lessons()->create($attributes);

            self::audit($actor, $course, 'lesson.created', $lesson);

            return $lesson;
        });
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public static function update(Lesson $lesson, array $validated, User $actor): Lesson
    {
        return DB::transaction(function () use ($lesson, $validated, $actor): Lesson {
            $lesson->fill(self::attributes($validated));
            $lesson->save();

            self::audit($actor, self::courseOf($lesson), 'lesson.updated', $lesson);

            return $lesson;
        });
    }

    /**
     * Usunięcie jest miękkie (`SoftDeletes` na modelu `Lesson`), więc żaden
     * wiersz `lesson_progress` nie znika — miękkie usunięcie nie kaskaduje.
     * To jest dokładnie kryterium ★2 karty pakietu: historyczny postęp zostaje.
     */
    public static function delete(Lesson $lesson, User $actor): void
    {
        DB::transaction(function () use ($lesson, $actor): void {
            // Kurs pobierany przed usunięciem — jest podmiotem wpisu audytowego.
            $course = self::courseOf($lesson);

            $lesson->delete();

            self::audit($actor, $course, 'lesson.deleted', $lesson);
        });
    }

    /**
     * Jawny `null` w `sequence_order` znaczy „nie ustawiam" (kolumna nie jest
     * nullable): przy tworzeniu numer nadaje serwis, przy edycji zostaje
     * dotychczasowy.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private static function attributes(array $validated): array
    {
        if (array_key_exists('sequence_order', $validated) && $validated['sequence_order'] === null) {
            unset($validated['sequence_order']);
        }

        return $validated;
    }

    /**
     * Kolejny wolny numer liczony po nieusuniętych lekcjach kursu: miękko
     * usunięta lekcja nie jest widoczna nigdzie w panelu, więc nie powinna
     * blokować numeru.
     */
    private static function nextSequenceOrder(Course $course): int
    {
        return (int) $course->lessons()->max('sequence_order') + 1;
    }

    /**
     * Kurs też ma miękkie usuwanie, a lekcje nie są przy nim kaskadowane —
     * bez `withTrashed()` operacja na lekcji osieroconego kursu wywróciłaby
     * się na braku podmiotu audytu.
     */
    private static function courseOf(Lesson $lesson): ?Course
    {
        return $lesson->course()->withTrashed()->first();
    }

    private static function audit(User $actor, ?Course $course, string $op, Lesson $lesson): void
    {
        AuditLog::record($actor, 'course.updated', $course, [
            'op' => $op,
            'lesson_id' => $lesson->id,
        ]);
    }
}
