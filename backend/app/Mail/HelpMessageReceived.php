<?php

namespace App\Mail;

use App\Models\HelpMessage;
use App\Support\Emails\EmailRenderer;
use App\Support\Emails\EmailValues;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Kopia zgłoszenia z okna pomocy do skrzynki zespołu (szablon E-05;
 * `config('help.inbox')`, adres z `HELP_INBOX_ADDRESS`). Kolejkowana na
 * połączeniu redis, żeby wysłanie nie blokowało odpowiedzi 201 —
 * `App\Services\Help\HelpMessageService` wysyła ją PO zatwierdzeniu
 * transakcji zapisu. Podaje imię, nazwisko i adres e-mail osoby
 * zgłaszającej, żeby zespół mógł odpowiedzieć.
 */
class HelpMessageReceived extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public HelpMessage $helpMessage)
    {
        $this->onConnection('redis');
    }

    public function build(): self
    {
        $sender = $this->helpMessage->user;

        $email = EmailRenderer::render('E-05', [
            'reference' => (string) $this->helpMessage->reference,
            'requesterName' => trim($sender?->first_name.' '.$sender?->last_name),
            'requesterEmail' => (string) $sender?->email,
            'role' => EmailValues::role($this->helpMessage->role),
            'screen' => (string) $this->helpMessage->screen,
            'content' => (string) $this->helpMessage->content,
        ]);

        return $this
            ->subject($email->subject)
            ->view('mail.help.received', ['email' => $email])
            ->text('mail.help.text');
    }
}
