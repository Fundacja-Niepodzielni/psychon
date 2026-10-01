<?php

namespace Tests\Unit\Services\Video;

use App\Services\Video\RecordingStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Tabela tłumaczenia stanu z odczytu statusu u dostawcy nagrań na stan lekcji.
 * Czysta logika — bez aplikacji i bez bazy.
 */
class RecordingStatusTest extends TestCase
{
    /**
     * Pełna lista wartości pola `status` z odczytu nagrania u dostawcy.
     *
     * @return array<string, array{int, string}>
     */
    public static function providerReadValues(): array
    {
        return [
            '0 Created' => [0, 'uploading'],
            '1 Uploaded' => [1, 'processing'],
            '2 Processing' => [2, 'processing'],
            '3 Transcoding' => [3, 'processing'],
            '4 Finished' => [4, 'ready'],
            '5 Error' => [5, 'error'],
            '6 UploadFailed' => [6, 'error'],
        ];
    }

    #[DataProvider('providerReadValues')]
    public function test_every_listed_provider_read_value_has_one_lesson_state(int $providerStatus, string $expected): void
    {
        $this->assertTrue(RecordingStatus::isKnownProviderRead($providerStatus));
        $this->assertSame($expected, RecordingStatus::fromProviderRead($providerStatus));
        $this->assertSame($expected, RecordingStatus::fromProviderRead((string) $providerStatus));
    }

    public function test_the_table_lists_exactly_the_documented_values(): void
    {
        $this->assertSame(
            array_column(array_values(self::providerReadValues()), 0),
            array_keys(RecordingStatus::PROVIDER_READ),
        );
    }

    /** @return array<string, array{mixed}> */
    public static function valuesOutsideTheTable(): array
    {
        return [
            'next number after the table' => [7],
            'far number' => [99],
            'negative' => [-1],
            'missing' => [null],
            'text' => ['finished'],
            'empty text' => [''],
            'float' => [4.0],
            'bool' => [true],
            'list' => [[4]],
            'number with a sign' => ['+4'],
        ];
    }

    #[DataProvider('valuesOutsideTheTable')]
    public function test_a_value_outside_the_table_is_processing_never_ready(mixed $providerStatus): void
    {
        $this->assertFalse(RecordingStatus::isKnownProviderRead($providerStatus));
        $this->assertSame(
            'processing',
            RecordingStatus::fromProviderRead($providerStatus),
            'Wartość spoza tabeli ma dać stan bezpieczny, nigdy „gotowe”.',
        );
    }

    public function test_only_non_terminal_states_may_ask_the_provider(): void
    {
        $this->assertTrue(RecordingStatus::asksProvider(null), 'Stan nieznany pyta dostawcę.');
        $this->assertTrue(RecordingStatus::asksProvider('uploading'));
        $this->assertTrue(RecordingStatus::asksProvider('processing'));
        $this->assertFalse(RecordingStatus::asksProvider('ready'), 'Stan „gotowe” nie pyta nigdy.');
        $this->assertFalse(RecordingStatus::asksProvider('error'), 'Stan „błąd” nie pyta nigdy.');
        $this->assertFalse(RecordingStatus::asksProvider('none'), 'Brak nagrania nie pyta nigdy.');
    }

    public function test_the_dictionary_has_five_values(): void
    {
        $this->assertSame(['none', 'uploading', 'processing', 'ready', 'error'], RecordingStatus::ALL);
    }
}
