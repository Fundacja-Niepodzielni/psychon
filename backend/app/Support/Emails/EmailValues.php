<?php

namespace App\Support\Emails;

use Carbon\CarbonInterface;

/**
 * Values written into e-mails the way people read them: dates in words,
 * names from the platform's dictionaries instead of technical codes.
 */
final class EmailValues
{
    private const array MONTHS = [
        1 => 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
        'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
    ];

    private const array ROLES = [
        'super_admin' => 'Super Admin',
        'project_manager' => 'Opiekun Projektu',
        'instructor' => 'Psycholog prowadzący',
        'volunteer' => 'Wolontariusz',
        'student' => 'Student',
    ];

    private const array DOCUMENT_KINDS = [
        'volunteer_agreement' => 'Porozumienie wolontariackie',
        'internship_certificate' => 'Zaświadczenie o stażu',
    ];

    private const array LEGAL_DOCUMENTS = [
        'regulamin' => 'Regulamin',
        'polityka' => 'Polityka',
    ];

    /**
     * „8 października 2026”, in the application's time zone.
     */
    public static function date(CarbonInterface $moment): string
    {
        $local = $moment->copy()->setTimezone((string) config('app.timezone'));

        return $local->day.' '.self::MONTHS[$local->month].' '.$local->year;
    }

    /**
     * „18:00”, in the application's time zone.
     */
    public static function time(CarbonInterface $moment): string
    {
        return $moment->copy()->setTimezone((string) config('app.timezone'))->format('H:i');
    }

    public static function role(?string $role): string
    {
        return self::ROLES[$role] ?? (string) $role;
    }

    public static function documentKind(string $type): string
    {
        return self::DOCUMENT_KINDS[$type] ?? $type;
    }

    public static function legalDocument(string $type): string
    {
        return self::LEGAL_DOCUMENTS[$type] ?? $type;
    }
}
