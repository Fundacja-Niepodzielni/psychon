<?php

namespace App\Support;

/**
 * Widok ładunku zdarzenia dla list i eksportów dziennika. Dziennik przyjmuje
 * identyfikatory, kody ze słowników i flagi; pola z treścią wpisaną ręcznie
 * (powód, komentarz, notatka, odpowiedź) żyją w rekordzie dziedzinowym,
 * skąd anonimizacja konta potrafi je usunąć. Ten widok pomija je także w
 * starszych wpisach, więc lista i plik nie pokazują treści, która
 * kiedykolwiek trafiła do ładunku.
 */
final class AuditDetailsView
{
    /**
     * Zbiór zamknięty — pola, których treść wpisuje ręcznie administracja.
     *
     * @var list<string>
     */
    public const array TEXT_FIELDS = [
        'reason',
        'comment',
        'note',
        'notes',
        'response',
        'description',
        'message',
    ];

    /**
     * @param  array<array-key, mixed>|null  $details
     * @return array<array-key, mixed>|null
     */
    public static function withoutText(?array $details): ?array
    {
        if ($details === null) {
            return null;
        }

        $kept = self::strip($details);

        return $kept === [] ? null : $kept;
    }

    /**
     * @param  array<array-key, mixed>  $details
     * @return array<array-key, mixed>
     */
    private static function strip(array $details): array
    {
        $kept = [];

        foreach ($details as $key => $value) {
            if (is_string($key) && in_array($key, self::TEXT_FIELDS, true)) {
                continue;
            }

            $kept[$key] = is_array($value) ? self::strip($value) : $value;
        }

        return $kept;
    }
}
