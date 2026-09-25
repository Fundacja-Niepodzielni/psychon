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
     * @param  bool  $requireNoConflict  Gdy true: wolontariusz z aktywnym przypisaniem do
     *                                   INNEGO prowadzącego nie zostaje przejęty — rzucany jest wyjątek 409 zamiast
     *                                   cichego zamknięcia cudzego przypisania. Domyślnie false, bo administracja
     *                                   (`AdminSupervisionController::assignSupervisor`) ma prawo świadomie
     *                                   przepisać wolontariusza do innego prowadzącego. Prowadzący dodający osobę
     *                                   do własnego wątku grupowego (`ThreadMemberController::store`) tego prawa
     *                                   nie ma — woła z `true`.
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
            foreach ($active as $assignment) {
                $assignment->forceFill(['unassigned_at' => $timestamp])->save();
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

    /**
     * Zamyka aktywne przypisanie wolontariusza do tego prowadzącego — użyte
     * przez `ThreadMemberController::destroy` (usunięcie osoby ze składu
     * wątku grupowego). Brak aktywnego przypisania tej pary = 404: ta osoba
     * nie jest (już) w składzie.
     */
    public function unassign(int $volunteerId, int $supervisorId): SupervisorAssignment
    {
        return DB::transaction(function () use ($volunteerId, $supervisorId): SupervisorAssignment {
            $assignment = SupervisorAssignment::query()
                ->where('volunteer_id', $volunteerId)
                ->where('supervisor_id', $supervisorId)
                ->whereNull('unassigned_at')
                ->lockForUpdate()
                ->first();

            if ($assignment === null) {
                throw new ApiException(404, 'not_found', 'Ta osoba nie jest w składzie tego wątku.');
            }

            $assignment->forceFill(['unassigned_at' => now()])->save();

            return $assignment;
        });
    }
}
