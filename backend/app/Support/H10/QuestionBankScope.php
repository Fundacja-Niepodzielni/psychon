<?php

namespace App\Support\H10;

use App\Exceptions\ApiException;
use App\Models\Test;
use App\Models\TestQuestion;
use App\Models\User;
use App\Services\H08\TopicScope;

/**
 * Pakiet H10 · zasięg tras banku pytań prowadzącego: wyłącznie testy (i ich
 * pytania) kursów z jego aktywnym przypisaniem na poziomie kursu. Zasięg
 * kursu rozstrzyga `TopicScope` — jedyna implementacja reguły „prowadzi ten
 * kurs” używana przez trasy tematów; ta klasa dokłada tylko przejście
 * pytanie → test → kurs i nie powtarza warunku przypisania.
 *
 * Test albo pytanie kursu obcego, kursu usuniętego i identyfikator
 * nieistniejący dają ten sam wyjątek 404 z tym samym komunikatem co
 * `TopicScope`, więc odpowiedź nie zdradza istnienia cudzego zasobu. Żądania
 * wołają ten zasięg w `authorize()`, czyli przed walidacją ciała.
 */
final class QuestionBankScope
{
    private const string NOT_FOUND = 'Nie znaleziono zasobu.';

    private function __construct(private readonly TopicScope $courses) {}

    public static function instructor(User $user): self
    {
        return new self(TopicScope::instructor($user));
    }

    /**
     * @throws ApiException
     */
    public function test(mixed $testId): Test
    {
        $test = Test::query()->whereKey(self::id($testId))->first()
            ?? throw new ApiException(404, 'not_found', self::NOT_FOUND);

        $this->courses->course($test->course_id);

        return $test;
    }

    /**
     * @throws ApiException
     */
    public function question(mixed $questionId): TestQuestion
    {
        $question = TestQuestion::query()->whereKey(self::id($questionId))->first()
            ?? throw new ApiException(404, 'not_found', self::NOT_FOUND);

        $this->test($question->test_id);

        return $question;
    }

    private static function id(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }
}
