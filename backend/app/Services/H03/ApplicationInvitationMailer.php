<?php

namespace App\Services\H03;

use App\Models\Application;
use App\Models\User;
use App\Support\Emails\EmailRenderer;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Prawdziwa wiadomość e-mail z zaproszeniem po przyjęciu zgłoszenia.
 *
 * `Notify::send()` zapisuje dzwonek i kopię symulowaną (`email_messages`),
 * ale niczego nie wysyła na zewnątrz. Ta klasa wysyła jedną wiadomość przez
 * skonfigurowany mailer. Wołana dopiero PO zatwierdzeniu transakcji
 * przyjęcia: wycofana decyzja nie może zostawić wysłanego zaproszenia.
 *
 * PsychON nie zakłada konta w Kontach Niepodzielni (bez Admin API). Odnośnik
 * prowadzi na stronę aktywacji, która przekierowuje do logowania w Kontach;
 * tam osoba bez konta rejestruje się tym samym adresem.
 *
 * Treść to szablon E-01 (wersja tekstowa i HTML z tych samych klocków co
 * pozostałe e-maile); adres odnośnika powstaje z adresu platformy
 * z konfiguracji i ścieżki aktywacji.
 */
final class ApplicationInvitationMailer
{
    public const SUBJECT = 'PsychON: zaproszenie do programu';

    /**
     * @return bool true, gdy mailer przyjął wiadomość
     */
    public static function send(Application $application, User $user, string $activationUrl): bool
    {
        $email = EmailRenderer::render('E-01', ['activationPath' => self::path($activationUrl)]);

        try {
            Mail::raw($email->text, function (Message $message) use ($user, $email): void {
                $message->to($user->email)->subject($email->subject)->html($email->html);
            });
        } catch (Throwable $e) {
            // Bez adresu i bez treści: identyfikatory wystarczą, by ponowić wysyłkę.
            Log::warning('application.invitation_mail_failed', [
                'application_id' => $application->id,
                'user_id' => $user->id,
                'exception' => $e::class,
            ]);

            return false;
        }

        return true;
    }

    /**
     * Ścieżka odnośnika aktywacyjnego (z zapytaniem) — adres platformy
     * dokłada szablon.
     */
    private static function path(string $activationUrl): string
    {
        $path = (string) parse_url($activationUrl, PHP_URL_PATH);
        $query = parse_url($activationUrl, PHP_URL_QUERY);

        return ($path === '' ? '/' : $path).(is_string($query) && $query !== '' ? '?'.$query : '');
    }
}
