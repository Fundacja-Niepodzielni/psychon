<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Polish PESEL number (H01 · M2 pkt 3). Validates length, the embedded
 * birth date (with the month-encoded century) and the checksum digit.
 */
class Pesel implements ValidationRule
{
    private const array WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || preg_match('/^\d{11}$/', $value) !== 1) {
            $fail('Nieprawidłowy numer PESEL.');

            return;
        }

        $digits = array_map('intval', str_split($value));

        if (! $this->hasValidDate($digits) || ! $this->hasValidChecksum($digits)) {
            $fail('Nieprawidłowy numer PESEL.');
        }
    }

    /**
     * @param  list<int>  $d
     */
    private function hasValidDate(array $d): bool
    {
        $year = $d[0] * 10 + $d[1];
        $month = $d[2] * 10 + $d[3];
        $day = $d[4] * 10 + $d[5];

        // The month field encodes the century (1800s..2200s).
        $century = match (intdiv($month, 20)) {
            0 => 1900,
            1 => 2000,
            2 => 2100,
            3 => 2200,
            4 => 1800,
            default => null,
        };

        if ($century === null) {
            return false;
        }

        return checkdate($month % 20, $day, $century + $year);
    }

    /**
     * @param  list<int>  $d
     */
    private function hasValidChecksum(array $d): bool
    {
        $sum = 0;

        foreach (self::WEIGHTS as $i => $weight) {
            $sum += $d[$i] * $weight;
        }

        return (10 - $sum % 10) % 10 === $d[10];
    }
}
