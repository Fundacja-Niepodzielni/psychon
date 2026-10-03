<?php

namespace App\Mail;

use App\Models\HelpMessage;
use App\Support\Emails\EmailRenderer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Potwierdzenie dla nadawcy zgłoszenia z okna pomocy (szablon E-04) — osobna
 * wiadomość od kopii do skrzynki zespołu (`HelpMessageReceived`), kolejkowana
 * tak samo na połączeniu redis.
 */
class HelpMessageConfirmation extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(public HelpMessage $helpMessage)
    {
        $this->onConnection('redis');
    }

    public function build(): self
    {
        $email = EmailRenderer::render('E-04', [
            'reference' => (string) $this->helpMessage->reference,
            'content' => (string) $this->helpMessage->content,
        ]);

        return $this
            ->subject($email->subject)
            ->view('mail.help.confirmation', ['email' => $email])
            ->text('mail.help.text');
    }
}
