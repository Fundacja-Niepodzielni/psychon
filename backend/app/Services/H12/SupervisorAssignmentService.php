<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

final class SupervisorAssignmentService
{
    /**
     * Przypisanie nadaje wyłącznie administracja
     * (`AdminSupervisionController::assignSupervisor`). Każde zamknięte przy tym
     * dotychczasowe przypisanie zapisuje w dzienniku `supervisor.unassigned`,
     * nowe — `supervisor.assigned`; ładunek obu to wyłącznie identyfikatory.
     *
     * @param  bool  $requireNoConflict  Gdy true: wolontariusz z aktywnym przypisaniem do
     *                                   INNEGO prowadzącego nie zostaje przejęty — rzucany jest wyjątek 409 zamiast
     *                                   zamknięcia dotychczasowego przypisania. Domyślnie false, bo administracja
     *                                   ma prawo świadomie przepisać wolontariusza do innego prowadzącego.
     */
    public function assign(User $actor, int $volunteerId, int $supervisorId, bool $requireNoConflict = false): SupervisorAssignment
    {
        return DB::transaction(function () use ($actor, $volunteerId, $supervisorId, $requireNoConflict): SupervisorAssignment {
            $volunteer = User::query()->whereKey($volunteerId)->lockForUpdate()->first();
            if ($volunteer === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono wolontariusza.');
            }

            $supervisor = User::query()->whereKey($supervisorId)->first();
            if ($volunteer->role !== 'volunteer' || $supervisor?->role !== 'instructor') {
                throw new ApiException(
                    422,
                    'validation_failed',
                    'Wybierz wolontariusza i użytkownika z rolą prowadzącego.',
                );
            }

            $active = SupervisorAssignment::query()
                ->where('volunteer_id', $volunteer->id)
                ->whereNull('unassigned_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            if ($active->count() === 1 && (int) $active->first()->supervisor_id === (int) $supervisor->id) {
                return $active->first();
            }

            if ($requireNoConflict && $active->isNotEmpty()) {
                throw new ApiException(
                    409,
                    'volunteer_already_assigned',
                    'Ta osoba jest już przypisana do innego prowadzącego.',
                );
            }

            $timestamp = now();
            foreach ($active as $closed) {
                $closed->forceFill(['unassigned_at' => $timestamp])->save();

                AuditLog::record($actor, 'supervisor.unassigned', $closed, [
                    'volunteer_id' => (int) $closed->volunteer_id,
                    'supervisor_id' => (int) $closed->supervisor_id,
                ]);
            }

            $assignment = SupervisorAssignment::query()->create([
                'volunteer_id' => $volunteer->id,
                'supervisor_id' => $supervisor->id,
                'assigned_at' => $timestamp,
            ]);

            AuditLog::record($actor, 'supervisor.assigned', $assignment, [
                'volunteer_id' => $volunteer->id,
                'supervisor_id' => $supervisor->id,
            ]);

            return $assignment;
        });
    }
}
