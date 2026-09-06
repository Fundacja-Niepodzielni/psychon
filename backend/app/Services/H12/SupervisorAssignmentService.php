<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

final class SupervisorAssignmentService
{
    public function assign(User $actor, int $volunteerId, int $supervisorId): SupervisorAssignment
    {
        return DB::transaction(function () use ($actor, $volunteerId, $supervisorId): SupervisorAssignment {
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
}
