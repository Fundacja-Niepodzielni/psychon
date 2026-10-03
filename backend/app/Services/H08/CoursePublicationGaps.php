<?php

namespace App\Services\H08;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\Test;
use App\Services\Video\LessonRecording;
use App\Services\Video\RecordingStatus;

/**
 * Braki kursu przed publikacją — JEDNA reguła dla dwóch dróg: zasób kursu
 * (`AdminCourseResource`, pole `publication_gaps`) pokazuje jej wynik, a
 * publikacja (`CourseWriter`) odmawia jej grupą blokującą.
 *
 * Dwie grupy:
 *  - `blocking` — „do zrobienia”: publikacja odmawia, dopóki lista nie jest
 *    pusta;
 *  - `waiting` — „czekamy”: nagranie jest wysyłane albo przetwarzane; ostrzega,
 *    nie blokuje.
 *
 * Każdy wpis to kod ze słownika zamkniętego i `lesson_id` (albo `null` dla
 * braku całego kursu) — bez wolnego tekstu:
 *
 * | lekcja                                                    | wpis                              |
 * |-----------------------------------------------------------|-----------------------------------|
 * | kurs bez żywej lekcji                                     | blocking `course_without_lessons` |
 * | bez nagrania i bez treści                                 | blocking `lesson_empty`           |
 * | nagranie w stanie „błąd”, żadnego gotowego                | blocking `recording_error`        |
 * | nagranie wysyłane albo przetwarzane, żadnego gotowego     | waiting `recording_in_progress`   |
 * | ma gotowe nagranie (także w czasie wymiany na nowe)       | —                                 |
 * | sama treść, bez nagrania                                  | —                                 |
 *
 * Po brakach lekcji — dwa braki całego kursu rodzaju `course` (webinaru nie
 * dotyczą: nie ma testu końcowego, a jego miejsca w ścieżce nie ustala żaden
 * ekran):
 *
 * | kurs                                                      | wpis                                    |
 * |-----------------------------------------------------------|-----------------------------------------|
 * | test końcowy tego kursu bez pytań                         | blocking `final_test_without_questions` |
 * | bez miejsca w Programie PsychON (`sequence_order` pusty)  | blocking `course_outside_program`       |
 *
 * Test bez pytań: uczestnik nie zaliczy kursu, a następny kurs ścieżki nie
 * odblokuje się nigdy (`CourseAccess::state()`). Kurs poza ścieżką byłby
 * zawsze otwarty i nie odblokowywałby kolejnych. Oba braki liczone są ze
 * stanu modelu, czyli przy publikacji — ze stanu PO złożeniu żądania.
 *
 * Reguła czyta wyłącznie bazę: nie pyta dostawcy nagrań.
 */
final class CoursePublicationGaps
{
    public const string COURSE_WITHOUT_LESSONS = 'course_without_lessons';

    public const string FINAL_TEST_WITHOUT_QUESTIONS = 'final_test_without_questions';

    public const string COURSE_OUTSIDE_PROGRAM = 'course_outside_program';

    public const string LESSON_EMPTY = 'lesson_empty';

    public const string RECORDING_ERROR = 'recording_error';

    public const string RECORDING_IN_PROGRESS = 'recording_in_progress';

    public const string BLOCKING = 'blocking';

    public const string WAITING = 'waiting';

    /**
     * @return array{blocking: list<array{code: string, lesson_id: int|null}>, waiting: list<array{code: string, lesson_id: int|null}>}
     */
    public static function for(?Course $course): array
    {
        $gaps = [self::BLOCKING => [], self::WAITING => []];

        $lessons = $course !== null && $course->exists
            ? Lesson::query()
                ->where('course_id', $course->getKey())
                ->orderBy('sequence_order')
                ->orderBy('id')
                ->select(['id', 'video_provider_id', 'video_status', 'video_status_at', 'video_pending_id'])
                ->selectRaw("coalesce(content ~ '[^[:space:]]', false) as has_content")
                ->get()
            : collect();

        if ($lessons->isEmpty()) {
            $gaps[self::BLOCKING][] = ['code' => self::COURSE_WITHOUT_LESSONS, 'lesson_id' => null];
        }

        foreach ($lessons as $lesson) {
            $gap = self::classify(LessonRecording::of($lesson), (bool) $lesson->getAttribute('has_content'));

            if ($gap !== null) {
                $gaps[$gap['group']][] = ['code' => $gap['code'], 'lesson_id' => (int) $lesson->getKey()];
            }
        }

        if ($course !== null) {
            foreach (self::courseGaps($course) as $code) {
                $gaps[self::BLOCKING][] = ['code' => $code, 'lesson_id' => null];
            }
        }

        return $gaps;
    }

    /**
     * Braki całego kursu rodzaju `course`, w kolejności: test końcowy, miejsce
     * w Programie PsychON. Liczy się wyłącznie test TEGO kursu.
     *
     * @return list<string>
     */
    private static function courseGaps(Course $course): array
    {
        if ($course->type !== 'course') {
            return [];
        }

        $codes = [];

        if ($course->exists && Test::query()
            ->where('course_id', $course->getKey())
            ->whereDoesntHave('questions')
            ->exists()) {
            $codes[] = self::FINAL_TEST_WITHOUT_QUESTIONS;
        }

        if ($course->sequence_order === null) {
            $codes[] = self::COURSE_OUTSIDE_PROGRAM;
        }

        return $codes;
    }

    /**
     * Brak jednej lekcji albo `null`, gdy lekcja niczego nie blokuje i na nic
     * nie czeka.
     *
     * @return array{group: string, code: string}|null
     */
    public static function classify(LessonRecording $recording, bool $hasContent): ?array
    {
        if ($recording->hasPlayable()) {
            return null;
        }

        return match ($recording->status()) {
            RecordingStatus::NONE => $hasContent
                ? null
                : ['group' => self::BLOCKING, 'code' => self::LESSON_EMPTY],
            RecordingStatus::ERROR => ['group' => self::BLOCKING, 'code' => self::RECORDING_ERROR],
            default => ['group' => self::WAITING, 'code' => self::RECORDING_IN_PROGRESS],
        };
    }
}
