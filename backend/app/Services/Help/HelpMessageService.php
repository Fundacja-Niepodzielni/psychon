<?php

namespace App\Services\Help;

use App\Mail\HelpMessageConfirmation;
use App\Mail\HelpMessageReceived;
use App\Models\HelpMessage;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Zapisuje zgloszenie z okna pomocy i wysyla dwie kolejkowane wiadomosci:
 * kopie do skrzynki zespolu (`config('help.inbox')`) i potwierdzenie do
 * nadawcy — jedyne miejsce, ktore to robi.
 *
 * `reference` (np. "POM-000123") powstaje z wlasnego `id` wiersza: druga
 * aktualizacja w TEJ SAMEJ transakcji, bez blokady doradczej — kolumna jest
 * `nullable`, a `NULL` nie koliduje z `UNIQUE` w PostgreSQL, wiec chwilowy
 * stan przed nadaniem numeru nigdy nie blokuje rownoleglych zgloszen.
 *
 * Maile ida PO zatwierdzeniu transakcji (poza `DB::transaction`), zeby
 * ewentualny rollback zapisu nigdy nie zostawial zakolejkowanej wiadomosci
 * dla wiersza, ktorego nie ma.
 */
final class HelpMessageService
{
    public function send(User $sender, TokenRoles $tokenRoles, string $content, string $screen): HelpMessage
    {
        $message = DB::transaction(function () use ($sender, $tokenRoles, $content, $screen): HelpMessage {
            $message = HelpMessage::query()->create([
                'user_id' => $sender->id,
                'role' => $tokenRoles->effectiveRoleFor($sender) ?? 'brak',
                'screen' => $screen,
                'content' => $content,
            ]);

            $message->forceFill([
                'reference' => sprintf('POM-%06d', $message->id),
            ])->save();

            return $message;
        });

        $inbox = config('help.inbox');

        if (is_string($inbox) && $inbox !== '') {
            Mail::to($inbox)->queue(new HelpMessageReceived($message));
        }

        Mail::to($sender->email)->queue(new HelpMessageConfirmation($message));

        return $message;
    }
}
