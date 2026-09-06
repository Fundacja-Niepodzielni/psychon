<?php

namespace App\Services\H03;

use InvalidArgumentException;

final class ApplicationEmailNormalizer
{
    /**
     * Return the canonical value used for every H03 e-mail comparison.
     *
     * E-mail addresses are deliberately not validated here: FormRequests
     * own transport validation. This helper only removes surrounding
     * whitespace and makes comparisons case-insensitive.
     */
    public static function normalize(string $email): string
    {
        $normalized = mb_strtolower(trim($email));

        if ($normalized === '') {
            throw new InvalidArgumentException('E-mail nie może być pusty.');
        }

        return $normalized;
    }
}
