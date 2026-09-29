<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\CourseTopic;
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
            // Blokada wiersza kursu przed policzeniem numeru: `max()+1` bez niej
            // (a tu nie było nawet `lockForUpdate`) daje dwóm równoczesnym zapisom
            // ten sam `sequence_order`. Bez unikatu kończyło się to nie błędem,
            // lecz dwiema lekcjami o tym samym numerze — czyli kolejnością
            // materiału zależną od przypadku, po cichu.
            Course::query()->whereKey($course->getKey())->lockForUpdate()->firstOrFail();

            TopicLayout::adoptOrphans($course);

            $attributes = self::attributes($validated);
            $explicitOrder = array_key_exists('sequence_order', $attributes);
            self::assertFlatOrderAllowed($course, $explicitOrder);

            $topic = self::targetTopic($course, $attributes['topic_id'] ?? null);
            unset($attributes['topic_id']);

            $attributes['sequence_order'] ??= self::nextSequenceOrder($course);
            $attributes['topic_id'] = $topic->id;
            $attributes['topic_position'] = $explicitOrder ? null : TopicLayout::nextLessonPosition($topic);

            $lesson = $course->lessons()->create($attributes);

            // Jawny numer w kursie z jednym tematem: pozycje w temacie idą za
            // `sequence_order`. Bez jawnego numeru lekcja trafia na koniec
            // tematu, a spłaszczona kolejność kursu idzie za tematami.
            if ($explicitOrder) {
                TopicLayout::rankBySequence($topic);
            } else {
                TopicLayout::flatten($course);
            }

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
            $attributes = self::attributes($validated);
            $course = self::courseOf($lesson);
            $explicitOrder = array_key_exists('sequence_order', $attributes);

            if ($explicitOrder && $course !== null) {
                Course::query()->withTrashed()->whereKey($course->getKey())->lockForUpdate()->firstOrFail();
                self::assertFlatOrderAllowed($course, true);
            }

            $lesson->fill($attributes);
            $lesson->save();

            if ($explicitOrder && $lesson->topic !== null) {
                TopicLayout::rankBySequence($lesson->topic);
            }

            self::audit($actor, $course, 'lesson.updated', $lesson);

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
     * Płaska kolejność (jawny `sequence_order`) ma sens tylko w kursie
     * z najwyżej jednym tematem. W kursie z kilkoma tematami kolejność
     * zmienia się wyłącznie przez `PATCH …/topics/reorder`.
     *
     * @throws ApiException
     */
    public static function assertFlatOrderAllowed(Course $course, bool $explicitOrder, string $field = 'sequence_order'): void
    {
        if (! $explicitOrder || TopicLayout::liveTopics($course)->count() <= 1) {
            return;
        }

        throw new ApiException(422, 'validation_failed', 'Popraw zaznaczone pola.', errors: [
            $field => ['Kurs ma kilka tematów — kolejność lekcji zmień przez kolejność tematów.'],
        ]);
    }

    /**
     * Temat wskazany w żądaniu musi być żywym tematem tego kursu — obcy
     * i nieistniejący identyfikator dają ten sam błąd pola. Bez wskazania
     * lekcja trafia do ostatniego tematu; kurs bez tematu dostaje temat
     * domyślny.
     *
     * @throws ApiException
     */
    private static function targetTopic(Course $course, mixed $topicId): CourseTopic
    {
        $topics = TopicLayout::liveTopics($course);

        if ($topicId === null) {
            return $topics->last() ?? TopicLayout::createDefaultTopic($course);
        }

        $topic = $topics->firstWhere('id', (int) $topicId);

        if ($topic === null) {
            throw new ApiException(422, 'validation_failed', 'Popraw zaznaczone pola.', errors: [
                'topic_id' => ['Wybierz temat tego kursu.'],
            ]);
        }

        return $topic;
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
