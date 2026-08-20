<?php

namespace App\Support;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The only notification bus (bell + simulated e-mail outbox).
 * FROZEN SIGNATURE — notification types exclusively from the API contract §3.1.
 */
final class Notify
{
    /**
     * Create a bell notification and its simulated e-mail copy.
     * Nothing is ever sent to the outside world during the hackathon.
     */
    public static function send(
        User $user,
        string $type,
        string $title,
        string $body,
        ?string $link = null,
    ): Notification {
        return DB::transaction(function () use ($user, $type, $title, $body, $link): Notification {
            $notification = Notification::create([
                'user_id' => $user->id,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'link' => $link,
            ]);

            EmailMessage::create([
                'to_email' => $user->email,
                'to_user_id' => $user->id,
                'subject' => $title,
                'body_html' => nl2br(e($body)),
                'status' => 'simulated',
                'related_type' => $notification->getMorphClass(),
                'related_id' => $notification->id,
                'sent_at' => now(),
            ]);

            return $notification;
        });
    }
}
