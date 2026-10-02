<?php

namespace App\Services\H03;

use App\Models\Application;
use App\Models\EmailMessage;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Wiadomość e-mail z powodem odrzucenia do kandydata.
 *
 * Kandydat nie ma konta, więc `Notify::send()` nie ma do kogo jej
 * zaadresować — ta klasa wysyła jedną wiadomość przez skonfigurowany mailer
 * na adres ze zgłoszenia. Wychodzi zawsze, niezależnie od przełącznika typu
 * `application.rejected` w ustawieniach powiadomień: przełącznik dotyczy
 * notatki dla osoby decydującej.
 *
 * Wołana dopiero PO zatwierdzeniu transakcji odrzucenia: wycofana decyzja
 * nie może zostawić wysłanej wiadomości.
 */
final class ApplicationRejectionMailer
{
    public const SUBJECT = 'Decyzja w sprawie zgłoszenia do programu PsychON';

    /**
     * @return bool true, gdy mailer przyjął wiadomość
     */
    public static function send(Application $application, string $reason): bool
    {
        $body = self::body($reason);
        $sent = true;

        try {
            Mail::raw($body, function (Message $message) use ($application): void {
                $message->to($application->email)->subject(self::SUBJECT);
            });
        } catch (Throwable $e) {
            // Bez adresu i bez powodu: identyfikator wystarczy, by ponowić wysyłkę.
            Log::warning('application.rejection_mail_failed', [
                'application_id' => $application->id,
                'exception' => $e::class,
            ]);
            $sent = false;
        }

        self::recordInOutbox($application, $body, $sent);

        return $sent;
    }

    public static function body(string $reason): string
    {
        return implode("\n\n", [
            'Dzień dobry,',
            'Dziękujemy za zgłoszenie do programu PsychON. Po rozpatrzeniu zgłoszenia nie możemy zaproponować udziału w programie.',
            'Powód: '.$reason,
            'Zespół Fundacji Niepodzielni',
        ]);
    }

    /**
     * Trwały ślad w skrzynce e-maili administracji (`GET /admin/emails`):
     * stan `sent` albo `failed`. Błąd zapisu śladu nie cofa decyzji ani
     * wysyłki — trafia do dziennika z samym identyfikatorem zgłoszenia.
     */
    private static function recordInOutbox(Application $application, string $body, bool $sent): void
    {
        try {
            EmailMessage::create([
                'to_email' => $application->email,
                'to_user_id' => null,
                'subject' => self::SUBJECT,
                'body_html' => nl2br(e($body)),
                'status' => $sent ? 'sent' : 'failed',
                'related_type' => $application->getMorphClass(),
                'related_id' => $application->id,
                'sent_at' => $sent ? now() : null,
            ]);
        } catch (Throwable $e) {
            Log::warning('application.rejection_mail_record_failed', [
                'application_id' => $application->id,
                'exception' => $e::class,
            ]);
        }
    }
}
