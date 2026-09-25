<?php

namespace App\Mail;

use App\Models\HelpMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

/**
 * Kopia zgloszenia z okna pomocy do skrzynki zespolu
 * (`config('help.inbox')`, adres z `HELP_INBOX_ADDRESS`). Kolejkowana na
 * polaczeniu redis, zeby wyslanie nie blokowalo odpowiedzi 201 —
 * `App\Services\Help\HelpMessageService` wysyla ja PO zatwierdzeniu
 * transakcji zapisu.
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
        return $this
            ->subject("Zgloszenie pomocy {$this->helpMessage->reference}")
            ->view('mail.help.received');
    }
}
