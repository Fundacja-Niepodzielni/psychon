<?php

namespace App\Services\DocumentTemplates;

use DateTimeImmutable;

/**
 * Dane przykładowe dokumentu — jedno miejsce, z którego bierze je próbne
 * generowanie przy zapisie wzoru (i podgląd wzoru, gdy powstanie).
 *
 * Wyłącznie wartości zmyślone: żadna nie pochodzi z bazy ani od prawdziwej
 * osoby. Kształt jest taki, jaki podają wywołujący generator: tablica napisów
 * dla porozumienia i zaświadczenia, a dla certyfikatu trzy rekordy i dwa napisy.
 */
final class DocumentTemplateSampleData
{
    /** Jednopikselowy obraz osadzony w treści — w miejscu kodu QR certyfikatu. */
    private const string SAMPLE_QR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=';

    /**
     * Adresy `data:`, które serwer sam wstawia do danych przykładowych tego rodzaju
     * dokumentu — lista dla silnika przy próbnym generowaniu i podglądzie.
     *
     * @return list<string>
     */
    public static function allowedDataUris(string $type): array
    {
        return $type === 'certificate' ? [self::SAMPLE_QR] : [];
    }

    /**
     * @return array<string, mixed>
     */
    public static function for(string $type): array
    {
        $person = [
            'first_name' => 'Anna',
            'last_name' => 'Przykładowa',
            'email' => 'anna.przykladowa@example.test',
            'phone' => '+48 000 000 000',
            'pesel' => '00000000000',
            'address_street' => 'ul. Przykładowa 1',
            'address_city' => 'Miasto',
            'address_zip' => '00-000',
            'edition_name' => 'Edycja przykładowa',
            'edition_starts_at' => '2026-01-15',
            'edition_ends_at' => '2026-12-15',
            'generated_at' => '2026-06-30',
        ];

        return match ($type) {
            'agreement' => ['number' => 'PW/2026/000'] + $person,
            'attendance_certificate' => ['number' => 'ZS/2026/000', 'hours_accepted' => '72', 'consultations_count' => 12] + $person,
            'certificate' => [
                'certificate' => ['number' => 'NP/2026/000', 'issued_at' => new DateTimeImmutable('2026-06-30 12:00:00')],
                'user' => ['first_name' => $person['first_name'], 'last_name' => $person['last_name']],
                'edition' => ['name' => $person['edition_name'], 'starts_at' => new DateTimeImmutable('2026-01-15 00:00:00')],
                'verify_url' => 'https://example.test/weryfikacja/NP-2026-000',
                'qr_svg' => self::SAMPLE_QR,
            ],
            default => [],
        };
    }
}
