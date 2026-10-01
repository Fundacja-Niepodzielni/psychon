<?php

namespace App\Services\Video;

/**
 * Stan nagrania lekcji (`lessons.video_status`) — słownik zamknięty pięciu
 * wartości oraz JEDYNA tabela tłumacząca stan z ODCZYTU statusu u dostawcy
 * nagrań na ten słownik.
 *
 * Tabela dotyczy wyłącznie pola `status` z odpowiedzi „pobierz nagranie”
 * (Bunny Stream, API Reference — Video object): 0 Created, 1 Uploaded,
 * 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed.
 *
 * UWAGA: powiadomienia zwrotne dostawcy (webhook) używają INNEJ numeracji
 * stanów niż odczyt statusu (tam 3 znaczy „gotowe”, a 4 — pierwszą gotową
 * rozdzielczość). Ta tabela NIE nadaje się do tłumaczenia powiadomień:
 * drugie źródło potrzebuje własnej tabeli. Odbioru powiadomień w kodzie nie ma.
 *
 * Wartość spoza tabeli (dostawca dopisał nowy stan, pole puste albo nie jest
 * liczbą) daje stan bezpieczny — „przetwarzanie”, nigdy „gotowe”: nagranie,
 * o którym nie wiemy, że da się je odtworzyć, nie trafia do uczestnika.
 */
final class RecordingStatus
{
    public const string NONE = 'none';

    public const string UPLOADING = 'uploading';

    public const string PROCESSING = 'processing';

    public const string READY = 'ready';

    public const string ERROR = 'error';

    /** @var list<string> */
    public const array ALL = [self::NONE, self::UPLOADING, self::PROCESSING, self::READY, self::ERROR];

    /**
     * Stan z odczytu statusu u dostawcy → stan lekcji.
     *
     * @var array<int, string>
     */
    public const array PROVIDER_READ = [
        0 => self::UPLOADING,   // Created — nagranie założone, plik jeszcze nie dotarł
        1 => self::PROCESSING,  // Uploaded
        2 => self::PROCESSING,  // Processing
        3 => self::PROCESSING,  // Transcoding
        4 => self::READY,       // Finished
        5 => self::ERROR,       // Error
        6 => self::ERROR,       // UploadFailed
    ];

    /**
     * Czy wartość odczytu statusu jest w tabeli.
     */
    public static function isKnownProviderRead(mixed $value): bool
    {
        return self::providerCode($value) !== null;
    }

    /**
     * Stan lekcji dla wartości odczytu statusu u dostawcy. Wartość spoza
     * tabeli → „przetwarzanie”.
     */
    public static function fromProviderRead(mixed $value): string
    {
        $code = self::providerCode($value);

        return $code === null ? self::PROCESSING : self::PROVIDER_READ[$code];
    }

    /**
     * Stany, przy których wolno zapytać dostawcę o nagranie: wysyłanie,
     * przetwarzanie i stan nieznany (`null`). Stany końcowe — gotowe, błąd —
     * oraz brak nagrania nie pytają nigdy.
     */
    public static function asksProvider(?string $status): bool
    {
        return $status === null || $status === self::UPLOADING || $status === self::PROCESSING;
    }

    private static function providerCode(mixed $value): ?int
    {
        if (is_string($value) && ctype_digit($value) && strlen($value) <= 3) {
            $value = (int) $value;
        }

        return is_int($value) && array_key_exists($value, self::PROVIDER_READ) ? $value : null;
    }
}
