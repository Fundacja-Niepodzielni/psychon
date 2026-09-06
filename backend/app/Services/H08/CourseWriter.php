<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H08 · zapis kursu, dwie reguły domenowe chroniące ścieżkę
 * uczestnika i audyt (rejestr kontraktu §3.2: `course.created`,
 * `course.updated`, `course.deleted`). Kontroler zostaje cienki.
 */
final class CourseWriter
{
    /**
     * @param  array<string, mixed>  $validated
     */
    public static function create(array $validated, User $actor): Course
    {
        $attributes = $validated + ['is_published' => false];

        // Świeży kurs nie ma lekcji, więc żądanie „utwórz i od razu opublikuj"
        // zawsze odbija się o regułę publikacji — cykl to szkic → lekcje → publikacja.
        self::assertPublishableWithLessons(null, (bool) $attributes['is_published']);

        return DB::transaction(function () use ($attributes, $actor): Course {
            $course = Course::create($attributes);

            AuditLog::record($actor, 'course.created', $course, [
                'slug' => $course->slug,
                'is_published' => $course->is_published,
            ]);

            return $course;
        });
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public static function update(Course $course, array $validated, User $actor): Course
    {
        return DB::transaction(function () use ($course, $validated, $actor): Course {
            $course->fill($validated);

            // Reguła liczy stan PO złożeniu żądania: sprawdzona na stanie
            // sprzed edycji przepuściłaby PATCH {is_published: true, …}.
            self::assertPublishableWithLessons($course, (bool) $course->is_published);

            $changed = array_keys($course->getDirty());
            $course->save();

            AuditLog::record($actor, 'course.updated', $course, [
                'changed' => $changed,
            ]);

            return $course;
        });
    }

    public static function delete(Course $course, User $actor): void
    {
        DB::transaction(function () use ($course, $actor): void {
            self::assertNotPrerequisite($course);

            $course->delete();

            AuditLog::record($actor, 'course.deleted', $course, [
                'slug' => $course->slug,
            ]);
        });
    }

    /**
     * Opublikowany kurs bez lekcji blokuje całą ścieżkę za sobą:
     * `CourseAccess::allLessonsCompleted()` zwraca `false` dla kursu z zerem
     * lekcji, więc nikt nigdy nie spełni warunku przejścia dalej.
     */
    private static function assertPublishableWithLessons(?Course $course, bool $willBePublished): void
    {
        if (! $willBePublished) {
            return;
        }

        if ($course !== null && $course->lessons()->exists()) {
            return;
        }

        throw new ApiException(
            422,
            'conditions_not_met',
            'Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.',
            reason: ['missing' => ['lessons']],
        );
    }

    /**
     * `CourseAccess::state()` wybiera poprzednika jako najbliższy niższy
     * opublikowany kurs, więc usunięcie środkowego etapu po cichu skraca
     * ścieżkę wszystkim, którzy na nim stoją.
     */
    private static function assertNotPrerequisite(Course $course): void
    {
        if (! $course->is_published || $course->sequence_order === null) {
            return;
        }

        $blocking = Course::query()
            ->where('is_published', true)
            ->whereNotNull('sequence_order')
            ->where('sequence_order', '>', $course->sequence_order)
            ->whereKeyNot($course->getKey())
            ->orderBy('sequence_order')
            ->pluck('id')
            ->all();

        if ($blocking === []) {
            return;
        }

        throw new ApiException(
            422,
            'conditions_not_met',
            'Ten kurs jest prerekwizytem kolejnych etapów ścieżki. Odpublikuj go albo przenieś na koniec ścieżki, zanim usuniesz.',
            reason: ['blocking_course_ids' => $blocking],
        );
    }
}
