<?php

namespace App\Services\H08;

use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use Illuminate\Database\Eloquent\Collection;

/**
 * Pakiet H08 · układ lekcji w tematach kursu. Jedyne miejsce, które nadaje
 * `course_topics.position`, `lessons.topic_id` i `lessons.topic_position`.
 *
 * Niezmienniki, których pilnuje:
 * - każda żywa lekcja kursu należy do żywego tematu tego kursu;
 * - `lessons.sequence_order` jest spłaszczoną kolejnością kursu: najpierw
 *   pozycja tematu, potem `topic_position` — płaska lista lekcji
 *   (`Course::lessons()`) zachowuje więc kolejność tematów.
 *
 * Wszystkie metody zakładają, że wywołujący trzyma już blokadę wiersza kursu
 * w otwartej transakcji (`TopicWriter`, `LessonWriter`, `SequenceReorderer`).
 */
final class TopicLayout
{
    /**
     * Numery parkingowe fazy pierwszej renumeracji — jak w `SequenceReorderer`:
     * na pozycjach stoją częściowe unikaty, więc zwykła zamiana dwóch pozycji
     * w jednej pętli przerwałaby operację na przejściowym duplikacie.
     */
    private const int PARKING_OFFSET = 20000;

    /**
     * @return Collection<int, CourseTopic>
     */
    public static function liveTopics(Course $course): Collection
    {
        return CourseTopic::query()
            ->where('course_id', $course->id)
            ->orderBy('position')
            ->orderBy('id')
            ->get();
    }

    /**
     * Temat domyślny na końcu kursu, z tytułem ze stałej zaplecza.
     */
    public static function createDefaultTopic(Course $course): CourseTopic
    {
        return CourseTopic::create([
            'course_id' => $course->id,
            'title' => CourseTopic::DEFAULT_TITLE,
            'position' => self::nextTopicPosition($course),
        ]);
    }

    public static function nextTopicPosition(Course $course): int
    {
        return (int) CourseTopic::query()->where('course_id', $course->id)->max('position') + 1;
    }

    public static function nextLessonPosition(CourseTopic $topic): int
    {
        return (int) Lesson::query()->where('topic_id', $topic->id)->max('topic_position') + 1;
    }

    /**
     * Żywe lekcje kursu bez żywego tematu (zapisane poza serwisem zapisu,
     * np. wprost przez model) dołączają na koniec ostatniego tematu; kurs bez
     * tematu dostaje temat domyślny. Po tym kroku niezmiennik „każda żywa
     * lekcja ma temat" znowu obowiązuje.
     */
    public static function adoptOrphans(Course $course): void
    {
        $orphans = Lesson::query()
            ->where('course_id', $course->id)
            ->whereDoesntHave('topic')
            ->orderBy('sequence_order')
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        if ($orphans === []) {
            return;
        }

        $topic = self::liveTopics($course)->last() ?? self::createDefaultTopic($course);

        self::placeLessons([[$topic->id, [...self::lessonIdsOf($topic), ...$orphans]]]);
        self::flatten($course);
    }

    /**
     * Identyfikatory żywych lekcji tematu w jego kolejności.
     *
     * @return list<int>
     */
    public static function lessonIdsOf(CourseTopic $topic): array
    {
        return Lesson::query()
            ->where('topic_id', $topic->id)
            ->whereNotNull('topic_position')
            ->orderBy('topic_position')
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * Identyfikatory żywych lekcji kursu (w dowolnym temacie albo bez tematu).
     *
     * @return list<int>
     */
    public static function liveLessonIds(Course $course): array
    {
        return Lesson::query()
            ->where('course_id', $course->id)
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * Kurs z jednym tematem, w którym kolejność zmieniono płasko (jawny
     * `sequence_order` albo `PATCH …/lessons/reorder`): pozycje w temacie
     * idą za `sequence_order`.
     */
    public static function rankBySequence(CourseTopic $topic): void
    {
        $ids = Lesson::query()
            ->where('topic_id', $topic->id)
            ->orderBy('sequence_order')
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        self::placeLessons([[$topic->id, $ids]]);
    }

    /**
     * Nadaje lekcjom temat i pozycję w temacie, dwufazowo.
     *
     * @param  list<array{0: int, 1: list<int>}>  $layout  pary [temat, lekcje w kolejności]
     */
    public static function placeLessons(array $layout): void
    {
        $parking = self::PARKING_OFFSET;

        foreach ($layout as [, $lessonIds]) {
            foreach ($lessonIds as $lessonId) {
                Lesson::query()->whereKey($lessonId)->update(['topic_position' => ++$parking]);
            }
        }

        foreach ($layout as [$topicId, $lessonIds]) {
            foreach ($lessonIds as $index => $lessonId) {
                Lesson::query()->whereKey($lessonId)->update([
                    'topic_id' => $topicId,
                    'topic_position' => $index + 1,
                ]);
            }
        }
    }

    /**
     * Numeruje tematy od jedynki w kolejności listy, dwufazowo.
     *
     * @param  list<int>  $topicIds
     */
    public static function renumberTopics(array $topicIds): void
    {
        foreach ($topicIds as $index => $topicId) {
            CourseTopic::query()->whereKey($topicId)->update(['position' => self::PARKING_OFFSET + $index + 1]);
        }

        foreach ($topicIds as $index => $topicId) {
            CourseTopic::query()->whereKey($topicId)->update(['position' => $index + 1]);
        }
    }

    /**
     * Przelicza spłaszczony `sequence_order` kursu z układu tematów — tylko
     * wtedy, gdy kolejność naprawdę się rozjechała, żeby zapis niezmieniający
     * kolejności nie przepisywał numerów.
     */
    public static function flatten(Course $course): void
    {
        $flat = Lesson::query()
            ->select('lessons.id')
            ->join('course_topics', 'course_topics.id', '=', 'lessons.topic_id')
            ->where('lessons.course_id', $course->id)
            ->whereNull('course_topics.deleted_at')
            ->orderBy('course_topics.position')
            ->orderBy('lessons.topic_position')
            ->orderBy('lessons.id')
            ->pluck('lessons.id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        $current = Lesson::query()
            ->where('course_id', $course->id)
            ->orderBy('sequence_order')
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        if ($flat === $current) {
            return;
        }

        SequenceReorderer::renumberLessons($flat);
    }
}
