<?php

namespace App\Services\Lessons;

use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Services\Video\LessonRecording;
use App\Services\Video\RecordingStatus;
use App\Support\Settings;

/**
 * Jedyna reguła „czy lekcję wolno już ukończyć” — czytają ją odczyt lekcji,
 * zapis postępu i ukończenie, więc `completable` i odpowiedź `complete`
 * nie mogą się rozjechać.
 *
 *  - Lekcja BEZ nagrania (stan nagrania dla uczestnika `none`, ta sama reguła,
 *    którą odczyt lekcji liczy `video_status`) jest do ukończenia od razu:
 *    nie ma czego oglądać, więc nie ma czasu do odrobienia — niezależnie od
 *    zapisanego czasu trwania. Wymagany czas aktywny wynosi wtedy 0.
 *  - Lekcja z nagraniem w przygotowaniu (`uploading`, `processing`) albo
 *    z nagraniem z błędem (`error`), bez gotowego nagrania, nie jest do
 *    ukończenia: uczestnik nie ma czego obejrzeć, a „bez nagrania” to coś
 *    innego niż „nagranie jeszcze nie działa”.
 *  - Lekcja z gotowym nagraniem (także o stanie nieustalonym, który jest
 *    traktowany jak grające): bez zmiany — czas trwania musi być dodatni,
 *    a czas aktywny nie mniejszy niż próg edycji
 *    (`lesson_completion_percent`) liczony od czasu trwania.
 */
final class LessonCompletionRule
{
    /**
     * Czy lekcja nie ma żadnego nagrania, które uczestnik mógłby obejrzeć lub
     * na które czeka. To ten sam stan, który odczyt lekcji wystawia jako
     * `video_status: none`.
     */
    public static function hasNoRecording(Lesson $lesson): bool
    {
        return LessonRecording::of($lesson)->participantStatus() === RecordingStatus::NONE;
    }

    /**
     * Czy lekcja może w ogóle zostać ukończona czasem: bez nagrania — zawsze,
     * z nagraniem — tylko przy dodatnim czasie trwania.
     */
    public static function canEverBeCompleted(Lesson $lesson): bool
    {
        return self::hasNoRecording($lesson) || (int) $lesson->duration_seconds > 0;
    }

    /**
     * Czas aktywny (w sekundach), od którego `completable` zmienia się na
     * `true`. Dla lekcji bez nagrania — 0. Dla lekcji z nagraniem o czasie
     * trwania 0 — także 0, ale lekcja nigdy nie jest do ukończenia (o tym
     * rozstrzyga `completable`, nie ta liczba).
     */
    public static function requiredActiveSeconds(Lesson $lesson): int
    {
        if (self::hasNoRecording($lesson)) {
            return 0;
        }

        $duration = (int) $lesson->duration_seconds;

        return $duration > 0
            ? (int) ceil($duration * self::percent() / 100)
            : 0;
    }

    /**
     * @return array{
     *     watched_seconds: int,
     *     active_seconds: int,
     *     completable: bool,
     *     completable_at_percent: int,
     * }
     */
    public static function snapshot(Lesson $lesson, LessonProgress $progress): array
    {
        return [
            'watched_seconds' => (int) $progress->watched_seconds,
            'active_seconds' => (int) $progress->active_seconds,
            'completable' => self::isCompletable($lesson, $progress),
            'completable_at_percent' => self::percent(),
        ];
    }

    /**
     * Czy lekcję wolno teraz ukończyć: bez nagrania — tak; z nagraniem
     * w przygotowaniu albo z błędem (bez gotowego) — nie; z gotowym
     * (albo nieustalonym) — gdy czas trwania jest dodatni, a czas aktywny
     * dosięgnął progu.
     */
    public static function isCompletable(Lesson $lesson, LessonProgress $progress): bool
    {
        $status = LessonRecording::of($lesson)->participantStatus();

        if ($status === RecordingStatus::NONE) {
            return true;
        }

        if ($status !== RecordingStatus::READY) {
            return false;
        }

        return (int) $lesson->duration_seconds > 0
            && (int) $progress->active_seconds >= self::requiredActiveSeconds($lesson);
    }

    private static function percent(): int
    {
        return (int) Settings::edition('lesson_completion_percent');
    }
}
