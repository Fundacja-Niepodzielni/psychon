<?php

namespace App\Services\Video;

/**
 * Identyfikator nagrania lekcji w usłudze wideo (`lessons.video_provider_id`).
 *
 * Wartość pisze prowadzący własnego kursu i administracja, a serwer wstawia ją
 * do adresu zadania wychodzącego z kluczem usługi oraz do adresów i podpisów
 * odtwarzania. Dlatego ma jedno, wąskie znaczenie: od 1 do 64 znaków z klasy
 * `A-Z a-z 0-9 -`. Identyfikatory nadawane przez usługę wideo (GUID) oraz
 * identyfikatory z danych demonstracyjnych mieszczą się w tej klasie.
 *
 * Wzorzec stoi tu, w jednym miejscu: walidacja zapisu lekcji i bramka przed
 * zadaniem wychodzącym czytają ten sam zapis, więc nie rozjadą się.
 * Kotwice `\A` i `\z` (nie `^` i `$`) nie przepuszczają znaku nowego wiersza
 * na końcu napisu.
 */
final class VideoProviderId
{
    public const string PATTERN = '/\A[A-Za-z0-9-]{1,64}\z/';

    /**
     * Czy wartość jest identyfikatorem, który wolno wstawić do adresu.
     *
     * @phpstan-assert-if-true string $value
     */
    public static function isValid(mixed $value): bool
    {
        return is_string($value) && preg_match(self::PATTERN, $value) === 1;
    }

    /**
     * Identyfikator jako jeden segment ścieżki adresu. Dla poprawnego
     * identyfikatora kodowanie niczego nie zmienia; chroni przed wartością,
     * która ominęłaby bramkę.
     */
    public static function segment(string $videoId): string
    {
        return rawurlencode($videoId);
    }
}
