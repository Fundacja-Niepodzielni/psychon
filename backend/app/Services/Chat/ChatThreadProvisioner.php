<?php

namespace App\Services\Chat;

use App\Models\MessageThread;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Tworzy wątek `individual`/`group` przy pierwszym odwołaniu — idempotentnie
 * (blokada w transakcji, ten sam wzorzec co `SupervisorAssignmentService`).
 * Para uczestnik+prowadzący / prowadzący dla wątku grupowego nie jest tu
 * wybierana — woła ją strona wywołująca na podstawie AKTYWNEGO
 * `supervisor_assignments`, żeby definicja grupy została w jednym miejscu.
 */
final class ChatThreadProvisioner
{
    public function ensureIndividual(User $volunteer, User $supervisor): MessageThread
    {
        return DB::transaction(function () use ($volunteer, $supervisor): MessageThread {
            $thread = MessageThread::query()
                ->where('type', 'individual')
                ->where('volunteer_id', $volunteer->id)
                ->where('supervisor_id', $supervisor->id)
                ->lockForUpdate()
                ->first();

            return $thread ?? MessageThread::query()->create([
                'type' => 'individual',
                'volunteer_id' => $volunteer->id,
                'supervisor_id' => $supervisor->id,
            ]);
        });
    }

    public function ensureGroup(User $supervisor): MessageThread
    {
        return DB::transaction(function () use ($supervisor): MessageThread {
            $thread = MessageThread::query()
                ->where('type', 'group')
                ->where('supervisor_id', $supervisor->id)
                ->lockForUpdate()
                ->first();

            return $thread ?? MessageThread::query()->create([
                'type' => 'group',
                'supervisor_id' => $supervisor->id,
                'volunteer_id' => null,
            ]);
        });
    }
}
