<?php

namespace App\Support\Emails;

/**
 * The one accessor for the Foundation's contact shown in e-mails
 * („Kontakt z Fundacją” in the footer and in the „Co dalej” box).
 *
 * Until the administration has a field for it, the value is the design
 * placeholder, shown with the „wartość do uzupełnienia” atom.
 */
final class EmailContact
{
    public const string PLACEHOLDER = '[kontakt Fundacji z panelu administracji]';

    /**
     * The contact text, or null when the e-mail should not show one.
     */
    public static function value(): ?string
    {
        return self::PLACEHOLDER;
    }

    public static function isPlaceholder(?string $value): bool
    {
        return $value === self::PLACEHOLDER;
    }
}
