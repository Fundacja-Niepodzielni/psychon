<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H08 · zapis tematów kursu: dodanie, zmiana tytułu, usunięcie
 * i jedna operacja kolejności obejmująca tematy i lekcje w tematach.
 *
 * Każda operacja blokuje wiersz kursu — ten sam zamek co przy dodawaniu
 * lekcji (`LessonWriter`) i płaskiej zmianie kolejności
 * (`SequenceReorderer`), bo wszystkie trzy piszą tę samą numerację.
 *
 * Audyt: slug `course.updated` z rejestru, podmiotem jest kurs, rodzaj
 * operacji w `details.op` — tak samo jak operacje na lekcjach. Ładunek niesie
 * dokładnie jeden identyfikator, nigdy listę.
 */
final class TopicWriter
{
    /**
     * @return Collection<int, CourseTopic>
     */
    public static function list(Course $course): Collection
    {
        return TopicLayout::liveTopics($course);
    }

    public static function create(Course $course, string $title, User $actor): CourseTopic
    {
        return DB::transaction(function () use ($course, $title, $actor): CourseTopic {
            self::lock($course);

            TopicLayout::adoptOrphans($course);

            $topic = CourseTopic::create([
                'course_id' => $course->id,
                'title' => $title,
                'position' => TopicLayout::nextTopicPosition($course),
            ]);

            self::audit($actor, $course, 'topic.created', ['topic_id' => $topic->id]);

            return $topic;
        });
    }

    public static function update(CourseTopic $topic, string $title, User $actor): CourseTopic
    {
        return DB::transaction(function () use ($topic, $title, $actor): CourseTopic {
            $topic->title = $title;
            $topic->save();

            self::audit($actor, $topic->course, 'topic.updated', ['topic_id' => $topic->id]);

            return $topic;
        });
    }

    /**
     * Temat z żywymi lekcjami nie znika: miękkie usunięcie lekcji razem
     * z tematem dotknęłoby postępu, a przeniesienie ich po cichu do innego
     * tematu byłoby decyzją, której nikt nie podjął.
     */
    public static function delete(CourseTopic $topic, User $actor): void
    {
        DB::transaction(function () use ($topic, $actor): void {
            $course = $topic->course;
            self::lock($course);

            if (Lesson::query()->where('topic_id', $topic->id)->exists()) {
                throw new ApiException(
                    422,
                    'conditions_not_met',
                    'Temat ma lekcje. Przenieś je najpierw do innego tematu.',
                );
            }

            $topic->delete();

            TopicLayout::renumberTopics(TopicLayout::liveTopics($course)->modelKeys());

            self::audit($actor, $course, 'topic.deleted', ['topic_id' => $topic->id]);
        });
    }

    /**
     * Jedna operacja na całym układzie kursu. `topics` musi być pełną
     * permutacją żywych tematów kursu, a suma wszystkich `lesson_ids` —
     * pełną permutacją żywych lekcji kursu. Brak, obcy identyfikator albo
     * duplikat odrzuca całe żądanie, zanim cokolwiek zostanie zapisane.
     *
     * @param  list<array{id: int, lesson_ids: list<int>}>  $topics
     * @return Collection<int, CourseTopic>
     */
    public static function reorder(Course $course, array $topics, User $actor): Collection
    {
        return DB::transaction(function () use ($course, $topics, $actor): Collection {
            self::lock($course);

            TopicLayout::adoptOrphans($course);

            $topicIds = array_map(static fn (array $topic): int => $topic['id'], $topics);
            $lessonIds = array_merge(...array_map(static fn (array $topic): array => $topic['lesson_ids'], $topics));

            self::assertFullPermutation(TopicLayout::liveTopics($course)->modelKeys(), $topicIds, $lessonIds, $course);

            TopicLayout::renumberTopics($topicIds);
            TopicLayout::placeLessons(array_map(
                static fn (array $topic): array => [$topic['id'], $topic['lesson_ids']],
                $topics,
            ));
            TopicLayout::flatten($course);

            self::audit($actor, $course, 'topics.reordered', ['course_id' => $course->id]);

            return TopicLayout::liveTopics($course);
        });
    }

    /**
     * @param  list<int>  $currentTopicIds
     * @param  list<int>  $topicIds
     * @param  list<int>  $lessonIds
     */
    private static function assertFullPermutation(array $currentTopicIds, array $topicIds, array $lessonIds, Course $course): void
    {
        $errors = [];

        if (! self::samePermutation($currentTopicIds, $topicIds)) {
            $errors[] = 'Lista musi zawierać wszystkie tematy tego kursu — każdy dokładnie raz, bez pominięć i obcych identyfikatorów.';
        }

        if (! self::samePermutation(TopicLayout::liveLessonIds($course), $lessonIds)) {
            $errors[] = 'Lekcje w tematach muszą obejmować wszystkie lekcje tego kursu — każdą dokładnie raz, bez pominięć i obcych identyfikatorów.';
        }

        if ($errors === []) {
            return;
        }

        throw new ApiException(422, 'validation_failed', 'Popraw zaznaczone pola.', errors: ['topics' => $errors]);
    }

    /**
     * @param  list<int>  $expected
     * @param  list<int>  $actual
     */
    private static function samePermutation(array $expected, array $actual): bool
    {
        sort($expected);
        sort($actual);

        return $expected === $actual;
    }

    private static function lock(Course $course): void
    {
        Course::query()->whereKey($course->getKey())->lockForUpdate()->firstOrFail();
    }

    /**
     * @param  array<string, int>  $companion
     */
    private static function audit(User $actor, ?Course $course, string $op, array $companion): void
    {
        AuditLog::record($actor, 'course.updated', $course, ['op' => $op, ...$companion]);
    }
}
