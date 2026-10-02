<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Pakiet H08 · zasięg tras tematów kursu i tras nagrań lekcji prowadzącego
 * (`lesson()`). Administracja widzi każdy żywy
 * kurs; prowadzący — wyłącznie kursy z aktywnym przypisaniem na poziomie
 * kursu (ta sama definicja co `CoursePolicy`).
 *
 * Zasięg jest warunkiem JEDNEGO zapytania: kurs obcy dla prowadzącego
 * i kurs nieistniejący dają ten sam wyjątek 404 z tym samym komunikatem,
 * więc odpowiedź nie zdradza istnienia cudzego kursu ani tematu. Żądania
 * wołają ten zasięg w `authorize()`, czyli przed walidacją ciała —
 * niepoprawne ciało na obcym zasobie też daje 404.
 */
final class TopicScope
{
    private const string NOT_FOUND = 'Nie znaleziono zasobu.';

    private function __construct(private readonly ?int $instructorId) {}

    public static function admin(): self
    {
        return new self(null);
    }

    public static function instructor(User $user): self
    {
        return new self((int) $user->id);
    }

    /**
     * @throws ApiException
     */
    public function course(mixed $courseId): Course
    {
        $course = $this->courses(Course::query())->whereKey(self::id($courseId))->first();

        return $course ?? throw new ApiException(404, 'not_found', self::NOT_FOUND);
    }

    /**
     * @throws ApiException
     */
    public function topic(mixed $topicId): CourseTopic
    {
        $topic = CourseTopic::query()
            ->whereKey(self::id($topicId))
            ->whereHas('course', fn (Builder $courses): Builder => $this->courses($courses))
            ->with('course')
            ->first();

        return $topic ?? throw new ApiException(404, 'not_found', self::NOT_FOUND);
    }

    /**
     * Żywa lekcja żywego kursu w zasięgu — dla tras nagrań prowadzącego
     * (`InstructorVideoController`). Ten sam warunek przypisania co kurs
     * i temat, w jednym zapytaniu: lekcja kursu obcego, lekcja usunięta
     * i lekcja nieistniejąca dają ten sam wyjątek.
     *
     * @throws ApiException
     */
    public function lesson(mixed $lessonId): Lesson
    {
        $lesson = Lesson::query()
            ->whereKey(self::id($lessonId))
            ->whereHas('course', fn (Builder $courses): Builder => $this->courses($courses))
            ->first();

        return $lesson ?? throw new ApiException(404, 'not_found', self::NOT_FOUND);
    }

    /**
     * @param  Builder<Course>  $courses
     * @return Builder<Course>
     */
    private function courses(Builder $courses): Builder
    {
        if ($this->instructorId === null) {
            return $courses;
        }

        return $courses->whereHas('assignments', fn (Builder $assignments): Builder => $assignments
            ->where('instructor_id', $this->instructorId)
            ->whereNull('lesson_id')
            ->whereNull('unassigned_at'));
    }

    private static function id(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }
}
