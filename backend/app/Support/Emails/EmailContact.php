<?php

namespace App\Support\Emails;

use App\Support\NotificationSettings;

/**
 * The one accessor for the Foundation's contact shown in e-mails
 * („Kontakt z Fundacją” in the footer and in the „Co dalej” box).
 *
 * The value is „Kontakt w e-mailach” from the administration's notification
 * settings. Without it the e-mails leave out the line and the sentences that
 * would carry it. The design placeholder is shown with the „wartość do
 * uzupełnienia” atom.
 */
final class EmailContact
{
    public const string PLACEHOLDER = '[kontakt Fundacji z panelu administracji]';

    /**
     * The contact text, or null when the e-mail should not show one.
     */
    public static function value(): ?string
    {
        return NotificationSettings::emailContact();
    }

    public static function isPlaceholder(?string $value): bool
    {
        return $value === self::PLACEHOLDER;
    }
}
