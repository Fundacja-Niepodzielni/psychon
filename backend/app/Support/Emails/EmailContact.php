<?php

namespace App\Support\Emails;

/**
 * The one accessor for the Foundation's contact shown in e-mails
 * („Kontakt z Fundacją” in the footer and in the „Co dalej” box).
 *
 * The value is `config('emails.foundation_contact')`. Until the
 * administration has a field for it, it is not set — and an e-mail without
 * the value shows no contact at all, never a placeholder.
 */
final class EmailContact
{
    /**
     * The contact text, or null when it is not set (the e-mail then leaves
     * the contact out).
     */
    public static function value(): ?string
    {
        $value = config('emails.foundation_contact');

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return trim($value);
    }
}
