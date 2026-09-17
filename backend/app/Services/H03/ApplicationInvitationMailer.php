<?php

namespace App\Services\H03;

use App\Models\Application;
use App\Models\User;
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
 */
final class ApplicationInvitationMailer
{
    public const SUBJECT = 'Zaproszenie do programu PsychON';

    /**
     * @return bool true, gdy mailer przyjął wiadomość
     */
    public static function send(Application $application, User $user, string $activationUrl): bool
    {
        $body = implode("\n\n", [
            'Dzień dobry,',
            'Twoje zgłoszenie do programu PsychON zostało przyjęte.',
            'Aby rozpocząć, otwórz poniższy odnośnik i zaloguj się przez Konta Niepodzielni. '
                .'Jeśli nie masz jeszcze konta, załóż je na ten sam adres e-mail, na który przyszła ta wiadomość, '
                .'i potwierdź adres linkiem z Kont Niepodzielni.',
            $activationUrl,
            'Zespół Fundacji Niepodzielni',
        ]);

        try {
            Mail::raw($body, function (Message $message) use ($user): void {
                $message->to($user->email)->subject(self::SUBJECT);
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
}
