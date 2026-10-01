<?php

use App\Models\Certificate;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Support\Carbon;

/*
 * Dane wejściowe złotych plików generatora dokumentów — sztuczne, w kształcie,
 * jaki podają wywołujący: migawka z `DocumentIssuer` (tablica napisów) dla
 * porozumienia i zaświadczenia, trzy modele i dwa napisy z `GenerateCertificate`
 * dla certyfikatu. Wartości celowo niosą znaki, które wymagają escapowania.
 *
 * Złote pliki obok (`golden/<rodzaj>.html`) policzono z tych danych widokami
 * z pliku na stanie sprzed zamiany kompilacji na podstawianie pól.
 */

$snapshot = [
    'first_name' => 'Zażółć',
    'last_name' => 'O\'Gęślą-<Jaźń> & "Spółka"',
    'email' => 'osoba.testowa@example.test',
    'phone' => '+48 000 000 000',
    'pesel' => '00000000000',
    'address_street' => 'ul. Próbna 1/2 <b>',
    'address_city' => 'Łódź',
    'address_zip' => '00-000',
    'edition_name' => 'Edycja „Próbna” 2026 & co',
    'edition_starts_at' => '2026-01-15',
    'edition_ends_at' => '2026-12-15',
    'number' => 'PW/2026/001',
    'generated_at' => '2026-10-01',
];

$user = (new User)->forceFill(['first_name' => 'Zażółć', 'last_name' => 'O\'Gęślą-<Jaźń> & "Spółka"']);
$edition = (new Edition)->forceFill(['name' => 'Edycja „Próbna” 2026 & co', 'starts_at' => Carbon::parse('2026-01-15 00:00:00', 'UTC')]);
$certificate = (new Certificate)->forceFill(['number' => 'NP/2026/001', 'issued_at' => Carbon::parse('2026-10-01 09:30:00', 'UTC')]);

return [
    'agreement' => [
        'view' => 'documents.volunteer-agreement',
        'data' => $snapshot,
    ],
    'attendance_certificate' => [
        'view' => 'documents.internship-certificate',
        'data' => ['number' => 'ZS/2026/001', 'hours_accepted' => '72.5', 'consultations_count' => 14] + $snapshot,
    ],
    'certificate' => [
        'view' => 'pdf.certificate',
        'data' => [
            'certificate' => $certificate,
            'user' => $user,
            'edition' => $edition,
            'verify_url' => 'https://example.test/certyfikat?token=abc&x=<1>',
            'qr_svg' => 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=',
        ],
    ],
];
