<?php

namespace App\Support\Emails;

use InvalidArgumentException;

/**
 * Every address in an e-mail is built here, from the configured platform
 * address (`app.frontend_url`, the address of the panel people use) and a
 * path inside the platform — never from a whole address passed in.
 */
final class EmailLinks
{
    public static function base(): string
    {
        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');
    }

    public static function url(string $path): string
    {
        if (! str_starts_with($path, '/') || str_starts_with($path, '//') || str_contains($path, '\\')) {
            throw new InvalidArgumentException('E-mail link must be a path inside the platform.');
        }

        return self::base().$path;
    }
}
