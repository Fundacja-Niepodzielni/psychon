<?php

namespace Tests\Unit\Services\Video;

use App\Services\H08\CoursePublicationGaps;
use App\Services\Video\LessonRecording;
use DateTimeImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Nagranie lekcji odczytane z trzech kolumn: co jest odtwarzane, co jest
 * „w drodze”, jaki stan widzi administracja i uczestnik oraz jaki brak
 * zgłasza reguła publikacji. Czysta logika — bez aplikacji i bez bazy.
 */
class LessonRecordingTest extends TestCase
{
    private const string OLD = 'mock-stare';

    private const string NEW = 'mock-nowe';

    /**
     * Kolumny lekcji → [stan dla administracji, czy jest link, stan dla
     * uczestnika, czy wolno pytać dostawcę, brak przy pustej treści, brak
     * przy treści].
     *
     * @return array<string, array{string|null, string|null, string|null, string|null, bool, string, bool, string|null, string|null}>
     */
    public static function lessonStates(): array
    {
        return [
            'no recording' => [null, null, null, 'none', false, 'none', false, 'blocking:lesson_empty', null],
            'no recording, stored none' => [null, null, 'none', 'none', false, 'none', false, 'blocking:lesson_empty', null],
            'played, state unknown' => [self::OLD, null, null, null, true, 'ready', true, null, null],
            'played, stored none means unknown' => [self::OLD, null, 'none', null, true, 'ready', true, null, null],
            'played, ready' => [self::OLD, null, 'ready', 'ready', true, 'ready', false, null, null],
            'played, found processing' => [self::OLD, null, 'processing', 'processing', false, 'processing', true, 'waiting:recording_in_progress', 'waiting:recording_in_progress'],
            'played, found uploading' => [self::OLD, null, 'uploading', 'uploading', false, 'uploading', true, 'waiting:recording_in_progress', 'waiting:recording_in_progress'],
            'played, error' => [self::OLD, null, 'error', 'error', false, 'error', false, 'blocking:recording_error', 'blocking:recording_error'],
            'only on its way, uploading' => [null, self::NEW, 'uploading', 'uploading', false, 'uploading', true, 'waiting:recording_in_progress', 'waiting:recording_in_progress'],
            'only on its way, state missing' => [null, self::NEW, null, 'uploading', false, 'uploading', true, 'waiting:recording_in_progress', 'waiting:recording_in_progress'],
            'only on its way, processing' => [null, self::NEW, 'processing', 'processing', false, 'processing', true, 'waiting:recording_in_progress', 'waiting:recording_in_progress'],
            'only on its way, error' => [null, self::NEW, 'error', 'error', false, 'error', false, 'blocking:recording_error', 'blocking:recording_error'],
            'replacement, uploading' => [self::OLD, self::NEW, 'uploading', 'uploading', true, 'ready', true, null, null],
            'replacement, processing' => [self::OLD, self::NEW, 'processing', 'processing', true, 'ready', true, null, null],
            'replacement, error of the new one' => [self::OLD, self::NEW, 'error', 'error', true, 'ready', false, null, null],
            'played id outside the pattern' => ['../x', null, null, 'none', false, 'none', false, 'blocking:lesson_empty', null],
            'state outside the dictionary means unknown' => [self::OLD, null, 'finished', null, true, 'ready', true, null, null],
        ];
    }

    #[DataProvider('lessonStates')]
    public function test_columns_translate_to_one_reading(
        ?string $played,
        ?string $pending,
        ?string $stored,
        ?string $adminStatus,
        bool $playable,
        string $participantStatus,
        bool $asksProvider,
        ?string $gapWhenEmpty,
        ?string $gapWithContent,
    ): void {
        $recording = new LessonRecording($played, $pending, $stored, null);

        $this->assertSame($adminStatus, $recording->status(), 'stan dla administracji');
        $this->assertSame($playable, $recording->hasPlayable(), 'czy uczestnik dostanie link');
        $this->assertSame($participantStatus, $recording->participantStatus(), 'stan dla uczestnika');
        $this->assertSame($asksProvider, $recording->asksProvider(), 'czy wolno pytać dostawcę');
        $this->assertSame($gapWhenEmpty, $this->gap($recording, false), 'brak przy lekcji bez treści');
        $this->assertSame($gapWithContent, $this->gap($recording, true), 'brak przy lekcji z treścią');
    }

    public function test_participant_sees_ready_exactly_when_the_link_is_issued(): void
    {
        foreach (self::lessonStates() as $name => $case) {
            $recording = new LessonRecording($case[0], $case[1], $case[2], null);

            $this->assertSame(
                $recording->hasPlayable(),
                $recording->participantStatus() === 'ready',
                "przypadek: {$name}",
            );
        }
    }

    public function test_a_recording_being_uploaded_or_processed_never_blocks_publication(): void
    {
        foreach (['uploading', 'processing'] as $status) {
            foreach ([true, false] as $hasContent) {
                $gap = CoursePublicationGaps::classify(new LessonRecording(null, self::NEW, $status, null), $hasContent);

                $this->assertSame(
                    ['group' => 'waiting', 'code' => 'recording_in_progress'],
                    $gap,
                    "Nagranie w stanie {$status} ostrzega, nie blokuje.",
                );
            }
        }
    }

    /** @return array<string, array{string|null, string|null, int|null, bool}> */
    public static function resumeCases(): array
    {
        return [
            'uploading, just created' => [self::NEW, 'uploading', 0, true],
            'uploading, one second before six hours' => [self::NEW, 'uploading', 21599, true],
            'uploading, exactly six hours' => [self::NEW, 'uploading', 21600, false],
            'uploading, seven hours' => [self::NEW, 'uploading', 25200, false],
            'uploading, time of the state missing' => [self::NEW, 'uploading', null, false],
            'uploading, state time in the future' => [self::NEW, 'uploading', -60, false],
            'processing' => [self::NEW, 'processing', 60, false],
            'error' => [self::NEW, 'error', 60, false],
            'nothing on its way' => [null, 'uploading', 60, false],
        ];
    }

    #[DataProvider('resumeCases')]
    public function test_upload_resumes_only_for_a_young_recording_still_being_uploaded(
        ?string $pending,
        ?string $stored,
        ?int $ageSeconds,
        bool $expected,
    ): void {
        $now = new DateTimeImmutable('2026-10-01T12:00:00Z');
        $statusAt = $ageSeconds === null ? null : $now->modify(sprintf('%+d seconds', -$ageSeconds));

        $recording = new LessonRecording(self::OLD, $pending, $stored, $statusAt);

        $this->assertSame($expected, $recording->resumable($now));
    }

    private function gap(LessonRecording $recording, bool $hasContent): ?string
    {
        $gap = CoursePublicationGaps::classify($recording, $hasContent);

        return $gap === null ? null : $gap['group'].':'.$gap['code'];
    }
}
