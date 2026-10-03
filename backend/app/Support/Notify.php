<?php

namespace App\Support;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Support\Emails\EmailRenderer;
use App\Support\Emails\EmailTemplates;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The only notification bus (bell + simulated e-mail outbox).
 * FROZEN SIGNATURE — notification types exclusively from the API contract §3.1.
 */
final class Notify
{
    /**
     * Create a bell notification and its simulated e-mail copy.
     * Nothing is ever sent to the outside world during the hackathon.
     * The e-mail copy is skipped when the recipient turned e-mail off for
     * this type (`notification_preferences`); the bell entry is always kept.
     *
     * A type switched off by administration (`NotificationSettings`)
     * creates neither the bell entry nor the e-mail — person preferences
     * only ever narrow a type already switched on.
     *
     * The e-mail copy is rendered from the type's template
     * (`EmailTemplates::NOTIFICATIONS`) with `$email` as its data; the bell
     * entry keeps `$title`, `$body` and `$link` exactly as given. A type
     * marked bell only (`EmailTemplates::BELL_ONLY`) gets no e-mail copy.
     * `$email['template']` picks another e-mail of the same type. A call
     * without the data its template needs keeps the former plain copy.
     *
     * @param  array<string, mixed>  $email
     */
    public static function send(
        User $user,
        string $type,
        string $title,
        string $body,
        ?string $link = null,
        array $email = [],
    ): ?Notification {
        if (! NotificationSettings::isTypeEnabled($type)) {
            return null;
        }

        return DB::transaction(function () use ($user, $type, $title, $body, $link, $email): Notification {
            $notification = Notification::create([
                'user_id' => $user->id,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'link' => $link,
            ]);

            if (EmailTemplates::isBellOnly($type)) {
                return $notification;
            }

            $emailDisabled = NotificationPreference::query()
                ->where('user_id', $user->id)
                ->where('type', $type)
                ->where('email', false)
                ->exists();

            if ($emailDisabled) {
                return $notification;
            }

            $copy = self::emailCopy($type, $title, $body, $email);

            EmailMessage::create([
                'to_email' => $user->email,
                'to_user_id' => $user->id,
                'subject' => $copy['subject'],
                'body_html' => $copy['body_html'],
                'status' => 'simulated',
                'related_type' => $notification->getMorphClass(),
                'related_id' => $notification->id,
                'sent_at' => now(),
            ]);

            return $notification;
        });
    }

    /**
     * @param  array<string, mixed>  $email
     * @return array{subject: string, body_html: string}
     */
    private static function emailCopy(string $type, string $title, string $body, array $email): array
    {
        $former = ['subject' => $title, 'body_html' => nl2br(e($body))];

        if (! EmailTemplates::covers($type)) {
            return $former;
        }

        $number = EmailTemplates::forNotification($type, $email['template'] ?? null);
        $data = Arr::except($email, 'template');
        $missing = EmailTemplates::missing($number, $data);

        if ($missing !== []) {
            // Names of the missing keys only — never the values.
            Log::warning('email.template_data_missing', [
                'type' => $type,
                'template' => $number,
                'missing' => $missing,
            ]);

            return $former;
        }

        $rendered = EmailRenderer::render($number, $data);

        return ['subject' => $rendered->subject, 'body_html' => $rendered->fragment];
    }
}
