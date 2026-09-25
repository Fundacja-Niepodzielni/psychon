<?php

namespace App\Mail;

use App\Models\HelpMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Potwierdzenie dla nadawcy zgloszenia z okna pomocy — osobna wiadomosc
 * od kopii do skrzynki zespolu (`HelpMessageReceived`), kolejkowana tak
 * samo na polaczeniu redis.
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
        return $this
            ->subject("Otrzymalismy Twoje zgloszenie {$this->helpMessage->reference}")
            ->view('mail.help.confirmation');
    }
}
