<?php

namespace App\Support;

use App\Models\Edition;
use RuntimeException;

/**
 * Read access to the active edition's rules. FROZEN SIGNATURE.
 * Keys — API contract §3.3: test_pass_threshold, test_attempts_limit,
 * internship_hours_required, supervision_required_count,
 * reliability_threshold, lesson_completion_percent.
 */
final class Settings
{
    /**
     * Value of a rule from the active edition, cast to the right type.
     */
    public static function edition(string $key): mixed
    {
        $edition = self::activeEdition();

        if (! array_key_exists($key, $edition->getAttributes())) {
            throw new RuntimeException("Nieznany klucz ustawień edycji: {$key}");
        }

        return $edition->{$key};
    }

    /**
     * The active edition (the MVP runs exactly one at a time).
     */
    public static function activeEdition(): Edition
    {
        $edition = Edition::where('status', 'active')->orderByDesc('id')->first();

        if ($edition === null) {
            throw new RuntimeException('Brak aktywnej edycji — uruchom seeder.');
        }

        return $edition;
    }
}
