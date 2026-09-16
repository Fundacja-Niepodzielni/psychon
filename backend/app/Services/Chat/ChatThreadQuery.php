<?php

namespace App\Services\Chat;

use App\Models\MessageThread;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Jedyne miejsce, które rozstrzyga „czy ten użytkownik widzi ten wątek" —
 * zarówno przy odczycie wątku, jak i przy wysłaniu wiadomości. Warunek
 * przynależności jest częścią WHERE, nie sprawdzeniem po pobraniu rekordu:
 * cudzy wątek i nieistniejący wątek muszą wyglądać identycznie z zewnątrz
 * (kontrakt §1.1 — 404, nigdy 403, dla pojedynczego zasobu wskazanego id).
 *
 * Członkostwo grupowe jest tu czytane NA ŻYWO z `supervisor_assignments`
 * (`unassigned_at IS NULL`) — zlecenie wprost zabrania duplikowania
 * definicji grupy gdzie indziej.
 */
final class ChatThreadQuery
{
    public static function visibleTo(User $user): Builder
    {
        return MessageThread::query()->where(function (Builder $query) use ($user): void {
            $query
                ->where(function (Builder $individual) use ($user): void {
                    $individual->where('type', 'individual')
                        ->where(function (Builder $party) use ($user): void {
                            $party->where('volunteer_id', $user->id)
                                ->orWhere('supervisor_id', $user->id);
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
}
