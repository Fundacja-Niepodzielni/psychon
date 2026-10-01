<?php

namespace Tests\Unit\Services\Video;

use App\Services\Video\VideoProviderId;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Wzorzec identyfikatora nagrania i kodowanie go jako segmentu ścieżki.
 * Czysta logika — bez aplikacji i bez bazy.
 */
class VideoProviderIdTest extends TestCase
{
    #[DataProvider('conformingIds')]
    public function test_it_accepts_an_id_from_the_allowed_class(string $id): void
    {
        $this->assertTrue(VideoProviderId::isValid($id));
    }

    /** @return array<string, array{string}> */
    public static function conformingIds(): array
    {
        return [
            'one character' => ['a'],
            'seed style' => ['mock-etap-1-3'],
            'provider guid' => ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
            'mixed case with digits' => ['AbC-xyz-09'],
            'sixty four characters' => [str_repeat('a', 64)],
        ];
    }

    #[DataProvider('rejectedValues')]
    public function test_it_rejects_everything_else(mixed $value): void
    {
        $this->assertFalse(VideoProviderId::isValid($value));
    }

    /** @return array<string, array{mixed}> */
    public static function rejectedValues(): array
    {
        return [
            'null' => [null],
            'empty string' => [''],
            'integer' => [123],
            'array' => [['a']],
            'sixty five characters' => [str_repeat('a', 65)],
            'parent directory' => ['../x'],
            'path into another library' => ['../../library/0/videos/x'],
            'slash' => ['a/b'],
            'backslash' => ['a\\b'],
            'question mark' => ['a?b'],
            'hash' => ['a#b'],
            'percent-encoded dots' => ['%2e%2e'],
            'space' => ['a b'],
            'underscore' => ['a_b'],
            'dot' => ['a.b'],
            'polish letters' => ['żółw'],
            'trailing newline' => ["abc\n"],
            'leading newline' => ["\nabc"],
            'null byte' => ["abc\0"],
        ];
    }

    #[DataProvider('encodedSegments')]
    public function test_segment_encodes_the_id_as_one_path_segment(string $id, string $expected): void
    {
        $this->assertSame($expected, VideoProviderId::segment($id));
    }

    /** @return array<string, array{string, string}> */
    public static function encodedSegments(): array
    {
        return [
            'conforming id is unchanged' => ['mock-etap-1-3', 'mock-etap-1-3'],
            'slash' => ['a/b', 'a%2Fb'],
            'parent directory' => ['../x', '..%2Fx'],
            'query and fragment' => ['x?y=1#z', 'x%3Fy%3D1%23z'],
            'percent sign' => ['%2e%2e', '%252e%252e'],
            'space' => ['a b', 'a%20b'],
        ];
    }

    #[DataProvider('normalizedForms')]
    public function test_normalize_trims_the_edges_and_lowercases(?string $id, ?string $expected): void
    {
        $this->assertSame($expected, VideoProviderId::normalize($id));
    }

    /** @return array<string, array{?string, ?string}> */
    public static function normalizedForms(): array
    {
        return [
            'lower case id is unchanged' => ['mock-etap-1-3', 'mock-etap-1-3'],
            'upper case' => ['MOCK-ETAP-1-3', 'mock-etap-1-3'],
            'mixed case guid' => ['3Fa85F64-5717-4562-B3fc-2C963f66AFA6', '3fa85f64-5717-4562-b3fc-2c963f66afa6'],
            'white space around' => ["  \tMock-1\n ", 'mock-1'],
            'null stays null' => [null, null],
            'empty string means no recording' => ['', null],
            'only white space means no recording' => ["  \n\t ", null],
        ];
    }
}
