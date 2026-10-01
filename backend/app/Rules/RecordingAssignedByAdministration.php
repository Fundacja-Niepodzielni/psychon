<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Str;

/**
 * Pole `video_provider_id` w żądaniach PROWADZĄCEGO (zapis lekcji własnego
 * kursu). Nagranie do lekcji przypisuje administracja — przez wgranie albo
 * w panelu — więc prowadzący może jedynie odesłać to, co jest już zapisane
 * w lekcji. Stary edytor prowadzącego odsyła tę wartość przy każdym zapisie
 * (wczytaną z lekcji albo `null`), więc zwykły zakaz pola zablokowałby każdą
 * edycję opisu czy tytułu.
 *
 * Przechodzi wyłącznie wartość RÓWNA zapisanej: przy nowej lekcji (`null`)
 * pole musi być puste, przy istniejącej — takie samo jak w bazie. Wszystko
 * inne, także `null` przy lekcji z nagraniem (prowadzący go nie odpina), liczba,
 * tablica albo wartość logiczna, kończy się jednym i tym samym zdaniem, które
 * nie zdradza, czy podany identyfikator istnieje w innej lekcji.
 *
 * Porównanie jest ścisłe, bez rzutowania typów. Globalne `TrimStrings` przycina
 * napisy jeszcze przed walidacją, a `ConvertEmptyStringsToNull` zamienia pusty
 * napis na `null`; reguła robi to samo z wartością, którą dostaje, żeby nie
 * zależeć od kolejności pośredników, a pusty napis w bazie (znaczy „brak
 * nagrania”) traktuje jak `null`.
 *
 * Reguła jest jawna (`implicit`): musi działać także dla `null` i pustego
 * napisu — `null` przy lekcji z nagraniem jest właśnie odpięciem.
 */
class RecordingAssignedByAdministration implements ValidationRule
{
    public const string MESSAGE = 'Nagranie do lekcji przypisuje administracja. Tego pola nie można tutaj zmienić.';

    public bool $implicit = true;

    /**
     * @param  string|null  $stored  wartość zapisana w lekcji; `null` przy nowej lekcji
     */
    public function __construct(private readonly ?string $stored) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (self::normalised($value) !== self::normalised($this->stored)) {
            $fail(self::MESSAGE);
        }
    }

    private static function normalised(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $trimmed = Str::trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
