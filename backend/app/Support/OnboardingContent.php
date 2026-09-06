<?php

namespace App\Support;

use App\Models\Setting;

/**
 * Pakiet H21 · Treść ekranu onboardingu „Zacznij tutaj".
 *
 * Trzymana jako jeden wiersz w tabeli `settings` (klucz `onboarding`,
 * `value` = JSON). Administracja edytuje ją przez PATCH /admin/onboarding —
 * bez kodu, widoczne natychmiast. Brak wiersza => zwracamy DEFAULTS, więc
 * ekran działa też na świeżej bazie i po wygaśnięciu dostępu.
 *
 * Kształt: trzy sekcje po angielskich kluczach, etykiety i treść po polsku.
 */
final class OnboardingContent
{
    public const string KEY = 'onboarding';

    /** Sekcje o ustalonych kluczach — merge i walidacja trzymają się tej listy. */
    public const array SECTIONS = ['video', 'program', 'expectations'];

    /** @var array<string, array<string, string|null>> */
    public const array DEFAULTS = [
        'video' => [
            'title' => 'Wprowadzenie do programu',
            'url' => null,
            'caption' => 'Krótki film powitalny pojawi się tutaj wkrótce.',
        ],
        'program' => [
            'title' => 'Jak wygląda program',
            'body' => 'Program prowadzi Cię przez kolejne etapy: kursy online z testami wiedzy, '
                .'staż pod opieką psychologa prowadzącego, superwizje grupowe oraz warsztat '
                .'stacjonarny. Każdy etap odblokowuje się po ukończeniu poprzedniego. Na końcu '
                .'otrzymujesz certyfikat ukończenia programu.',
        ],
        'expectations' => [
            'title' => 'Czego od Ciebie oczekujemy',
            'body' => 'Regularnej pracy z materiałami, obecności na superwizjach i rzetelnego '
                .'prowadzenia dziennika stażu bez danych osób, którym pomagasz. Dostęp do '
                .'materiałów masz przez sześć miesięcy. W razie pytań pisz do opiekuna projektu.',
        ],
    ];

    /**
     * Pełna treść onboardingu: zapis administracji scalony z wartościami domyślnymi.
     *
     * @return array<string, array<string, string|null>>
     */
    public static function get(): array
    {
        $stored = Setting::query()->where('key', self::KEY)->value('value');
        $decoded = is_string($stored) ? json_decode($stored, true) : null;

        return self::merge(self::DEFAULTS, is_array($decoded) ? $decoded : []);
    }

    /**
     * Zapisuje częściową aktualizację, scaloną z bieżącą treścią.
     *
     * @param  array<string, mixed>  $patch  kształt wymuszony przez FormRequest
     * @return array<string, array<string, string|null>> pełna treść po zapisie
     */
    public static function put(array $patch): array
    {
        $merged = self::merge(self::get(), $patch);

        Setting::query()->updateOrCreate(
            ['key' => self::KEY],
            ['value' => json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
        );

        return $merged;
    }

    /**
     * Płytkie scalenie per sekcja: pola z $patch nadpisują pola $base,
     * nieznane sekcje i pola są pomijane.
     *
     * @param  array<string, array<string, string|null>>  $base
     * @param  array<string, mixed>  $patch
     * @return array<string, array<string, string|null>>
     */
    private static function merge(array $base, array $patch): array
    {
        foreach (self::SECTIONS as $section) {
            if (! isset($patch[$section]) || ! is_array($patch[$section])) {
                continue;
            }

            foreach (array_keys($base[$section]) as $field) {
                if (array_key_exists($field, $patch[$section])) {
                    $base[$section][$field] = $patch[$section][$field];
                }
            }
        }

        return $base;
    }
}
