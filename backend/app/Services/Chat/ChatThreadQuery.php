<?php

namespace App\Services\Chat;

use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * Jedyne miejsce, które rozstrzyga „czy ten użytkownik widzi ten wątek" —
 * zarówno przy odczycie wątku, jak i przy wysłaniu wiadomości. Warunek
 * przynależności jest częścią WHERE, nie sprawdzeniem po pobraniu rekordu:
 * cudzy wątek i nieistniejący wątek muszą wyglądać identycznie z zewnątrz
 * (kontrakt §1.1 — 404, nigdy 403, dla pojedynczego zasobu wskazanego id).
 *
 * Członkostwo grupowe jest tu czytane NA ŻYWO z `supervisor_assignments`
 * (`unassigned_at IS NULL`) — jedyne źródło definicji grupy, żeby nie
 * powstały dwa miejsca odpowiadające różnie na pytanie „kto jest w grupie".
 *
 * Wątek indywidualny prowadzący widzi tylko, dopóki para (osoba, prowadzący)
 * ma aktywne przypisanie — po zmianie opiekuna poprzedni traci odczyt
 * i zapis od razu. Osoba widzi swój wątek zawsze, ale pisać może w nim
 * tylko przy aktywnym przypisaniu tej pary (`isOpen`); wątek z poprzednim
 * opiekunem zostaje dla niej do odczytu.
 */
final class ChatThreadQuery
{
    /**
     * @return Builder<MessageThread>
     */
    public static function visibleTo(User $user): Builder
    {
        return MessageThread::query()->where(function (Builder $query) use ($user): void {
            $query
                ->where(function (Builder $individual) use ($user): void {
                    $individual->where('type', 'individual')
                        ->where(function (Builder $party) use ($user): void {
                            $party->where('volunteer_id', $user->id)
                                ->orWhere(function (Builder $supervisor) use ($user): void {
                                    $supervisor->where('supervisor_id', $user->id)
                                        ->whereExists(function (QueryBuilder $sub): void {
                                            self::activePairAssignment($sub);
                                        });
                                });
                        });
                })
                ->orWhere(function (Builder $group) use ($user): void {
                    $group->where('type', 'group')
                        ->where(function (Builder $member) use ($user): void {
                            $member->where('supervisor_id', $user->id)
                                ->orWhereExists(function ($sub) use ($user): void {
                                    $sub->selectRaw('1')
                                        ->from('supervisor_assignments')
                                        ->whereColumn(
                                            'supervisor_assignments.supervisor_id',
                                            'message_threads.supervisor_id',
                                        )
                                        ->where('supervisor_assignments.volunteer_id', $user->id)
                                        ->whereNull('supervisor_assignments.unassigned_at');
                                });
                        });
                });
        });
    }

    /**
     * Czy w widocznym wątku wolno pisać. Wątek grupowy widoczny jest tylko
     * przy aktywnym członkostwie, więc jest otwarty; wątek indywidualny —
     * tylko przy aktywnym przypisaniu jego pary.
     */
    public static function isOpen(MessageThread $thread): bool
    {
        if (! $thread->isIndividual()) {
            return true;
        }

        return SupervisorAssignment::query()
            ->where('volunteer_id', $thread->volunteer_id)
            ->where('supervisor_id', $thread->supervisor_id)
            ->whereNull('unassigned_at')
            ->exists();
    }

    /**
     * Podzapytanie: aktywne przypisanie dokładnie tej pary, której dotyczy
     * wiersz `message_threads`.
     */
    private static function activePairAssignment(QueryBuilder $sub): void
    {
        $sub->selectRaw('1')
            ->from('supervisor_assignments')
            ->whereColumn('supervisor_assignments.volunteer_id', 'message_threads.volunteer_id')
            ->whereColumn('supervisor_assignments.supervisor_id', 'message_threads.supervisor_id')
            ->whereNull('supervisor_assignments.unassigned_at');
    }
}
