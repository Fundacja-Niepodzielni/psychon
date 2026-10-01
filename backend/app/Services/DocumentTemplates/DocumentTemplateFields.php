<?php

namespace App\Services\DocumentTemplates;

use DateTimeInterface;

/**
 * Zamknięta lista pól każdego rodzaju dokumentu i jedyne miejsce, które zamienia
 * treść wzoru z bazy na HTML.
 *
 * Treść wzoru NIE jest szablonem: nie jest kompilowana ani wykonywana. Jedyne,
 * co generator w niej rozpoznaje, to miejsce na pole zapisane dokładnie jako
 * `{{ $nazwa }}`, z nazwą z listy rodzaju. Miejsce jest zastępowane zwykłą
 * zamianą tekstu gotową wartością (po zamianie znaków specjalnych HTML); cała
 * reszta treści przechodzi do dokumentu bez interpretacji.
 *
 * Logika, którą dawniej niosły wyrażenia we wzorze (wartość domyślna, format
 * daty, rok edycji), mieszka tutaj: pole dostaje gotowy tekst.
 *
 * Z tej samej listy ma korzystać edytor („Wstaw pole").
 */
final class DocumentTemplateFields
{
    /** Limit długości treści wzoru — w znakach, nie w bajtach. */
    public const int MAX_CONTENT_LENGTH = 20000;

    private const string DASH = '—';

    /**
     * Rodzaj -> pole -> wartość wstawiana, gdy dane wywołania pola nie niosą.
     *
     * @var array<string, array<string, string>>
     */
    private const array FIELDS = [
        'agreement' => [
            'number' => self::DASH,
            'edition_name' => self::DASH,
            'generated_at' => self::DASH,
            'first_name' => self::DASH,
            'last_name' => '',
            'pesel' => self::DASH,
            'address_street' => self::DASH,
            'address_zip' => '',
            'address_city' => '',
            'email' => self::DASH,
            'phone' => self::DASH,
            'edition_starts_at' => self::DASH,
            'edition_ends_at' => self::DASH,
        ],
        'attendance_certificate' => [
            'number' => self::DASH,
            'edition_name' => self::DASH,
            'generated_at' => self::DASH,
            'first_name' => self::DASH,
            'last_name' => '',
            'pesel' => self::DASH,
            'address_street' => self::DASH,
            'address_zip' => '',
            'address_city' => '',
            'hours_accepted' => self::DASH,
            'consultations_count' => self::DASH,
            'edition_starts_at' => self::DASH,
            'edition_ends_at' => self::DASH,
        ],
        'certificate' => [
            'certificate_number' => '',
            'first_name' => '',
            'last_name' => '',
            'edition_year' => '',
            'edition_name' => '',
            'issued_at' => '',
            'verify_url' => '',
            'qr_svg' => '',
        ],
    ];

    /**
     * @return list<string>
     */
    public static function names(string $type): array
    {
        return array_keys(self::FIELDS[$type] ?? []);
    }

    public static function placeholder(string $name): string
    {
        return '{{ $'.$name.' }}';
    }

    /**
     * Powód odmowy zwykłym językiem albo `null`, gdy treść zawiera wyłącznie
     * tekst i dozwolone miejsca na pola.
     */
    public static function violation(string $type, string $content): ?string
    {
        $allowed = 'Wolno wstawić wyłącznie pola z listy tego dokumentu, zapisane dokładnie tak: '
            .self::placeholder('nazwa').'. Dostępne pola: '.implode(', ', self::names($type)).'.';

        $rest = str_replace(array_map(self::placeholder(...), self::names($type)), '', $content);

        if (preg_match('/\{\{ \$([A-Za-z_][A-Za-z0-9_]*) \}\}/', $rest, $unknown) === 1) {
            return 'Pole „'.$unknown[1].'” nie istnieje w tym dokumencie. '.$allowed;
        }

        if (str_contains($rest, '{!!') || str_contains($rest, '!!}')) {
            return 'Treść nie może zawierać zapisu „{!! … !!}”. '.$allowed;
        }

        if (str_contains($rest, '{{') || str_contains($rest, '}}')) {
            return 'Podwójne nawiasy klamrowe mogą otaczać tylko nazwę pola — bez wyrażeń, wartości domyślnych i komentarzy. '.$allowed;
        }

        if (str_contains($rest, '<?') || str_contains($rest, '?>')) {
            return 'Treść nie może zawierać znaczników „<?” ani „?>”. '.$allowed;
        }

        if (preg_match('/(?<![\p{L}\p{N}_])@\p{L}/u', $rest) === 1) {
            return 'Treść nie może zawierać słów zaczynających się od znaku „@” (na przykład @if, @php, @page). Adres e-mail jest dozwolony. '.$allowed;
        }

        return null;
    }

    /**
     * Gotowe napisy dla pól rodzaju, policzone z danych, jakie podaje wywołujący.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, string>
     */
    public static function values(string $type, array $data): array
    {
        $source = $type === 'certificate' ? self::certificateSource($data) : $data;
        $values = [];

        foreach (self::FIELDS[$type] ?? [] as $name => $default) {
            $value = $source[$name] ?? null;
            $values[$name] = is_scalar($value) ? (string) $value : $default;
        }

        return $values;
    }

    /**
     * HTML dokumentu z treści wzoru: zwykła zamiana tekstu, nic nie jest wykonywane.
     *
     * @param  array<string, mixed>  $data
     */
    public static function render(string $type, string $content, array $data): string
    {
        $replacements = [];

        foreach (self::values($type, $data) as $name => $value) {
            $replacements[self::placeholder($name)] = e($value);
        }

        return strtr($content, $replacements);
    }

    /**
     * Certyfikat dostaje trzy modele i dwa napisy; rama wyciąga z nich gotowy tekst.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private static function certificateSource(array $data): array
    {
        $issuedAt = data_get($data, 'certificate.issued_at');
        $startsAt = data_get($data, 'edition.starts_at');

        return [
            'certificate_number' => data_get($data, 'certificate.number'),
            'first_name' => data_get($data, 'user.first_name'),
            'last_name' => data_get($data, 'user.last_name'),
            'edition_year' => $startsAt instanceof DateTimeInterface ? $startsAt->format('Y') : null,
            'edition_name' => data_get($data, 'edition.name'),
            'issued_at' => $issuedAt instanceof DateTimeInterface ? $issuedAt->format('d.m.Y') : null,
            'verify_url' => $data['verify_url'] ?? null,
            'qr_svg' => $data['qr_svg'] ?? null,
        ];
    }
}
