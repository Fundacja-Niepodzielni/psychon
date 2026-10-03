<?php

namespace App\Support\Emails;

use App\Models\EmailMessage;
use App\Models\User;

/**
 * E-mails without a bell entry (E-31, E-40): rendered from their template
 * and kept in the outbox with status „simulated”, like every e-mail of the
 * notification bus. Nothing leaves the system.
 */
final class EmailOutbox
{
    /**
     * @param  array<string, mixed>  $data
     */
    public static function simulate(User $user, string $number, array $data = []): EmailMessage
    {
        $email = EmailRenderer::render($number, $data);

        return EmailMessage::create([
            'to_email' => $user->email,
            'to_user_id' => $user->id,
            'subject' => $email->subject,
            'body_html' => $email->fragment,
            'status' => 'simulated',
            'related_type' => $user->getMorphClass(),
            'related_id' => $user->id,
            'sent_at' => now(),
        ]);
    }
}
