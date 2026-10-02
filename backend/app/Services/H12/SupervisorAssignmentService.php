<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

final class SupervisorAssignmentService
{
    /** Najwięcej osób w jednym przypisaniu wielu osób naraz (`assignToMany`). */
    public const int MAX_PEOPLE_AT_ONCE = 100;

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
     * Przypisanie jednego prowadzącego wielu osobom naraz
     * (`AdminSupervisionController::assignSupervisorToMany`). Dla każdej osoby
     * woła `assign()` — tę samą ścieżkę co pojedyncze przypisanie, każdą we
     * własnej transakcji — więc skutki (zamknięcie poprzedniego przypisania,
     * wpis `supervisor.assigned`, zmiana składu rozmów) są dokładnie te same.
     * Odmowa przy jednej osobie nie cofa pozostałych. Wynik w kolejności
     * żądania: `assigned`, `unchanged` (ten sam prowadzący już był, bez wpisu
     * w dzienniku), `refused` z kodem powodu albo `not_found`.
     *
     * @param  list<int>  $volunteerIds
     * @return list<array{user_id: int, result: string, reason: string|null}>
     */
    public function assignToMany(User $actor, int $supervisorId, array $volunteerIds): array
    {
        $results = [];

        foreach ($volunteerIds as $volunteerId) {
            try {
                $assignment = $this->assign($actor, $volunteerId, $supervisorId);
                $result = $assignment->wasRecentlyCreated ? 'assigned' : 'unchanged';
                $reason = null;
            } catch (ApiException $exception) {
                [$result, $reason] = match (true) {
                    $exception->status === 404 => ['not_found', null],
                    $exception->errorCode === 'validation_failed' => ['refused', 'role_not_assignable'],
                    default => ['refused', $exception->errorCode],
                };
            }

            $results[] = ['user_id' => $volunteerId, 'result' => $result, 'reason' => $reason];
        }

        return $results;
    }

    /**
     * Bieżący prowadzący osoby (aktywne przypisanie) albo `null` — pole tylko
     * do odczytu na liście osób i na karcie osoby. Gdy wołający wczytał już
     * relację `supervisorAssignments` z prowadzącym, nie ma dodatkowego
     * zapytania; inaczej jedno zapytanie na osobę.
     *
     * @return array{id: int, name: string}|null
     */
    public static function currentSupervisorOf(User $person): ?array
    {
        if ($person->relationLoaded('supervisorAssignments')) {
            /** @var SupervisorAssignment|null $active */
            $active = $person->supervisorAssignments
                ->whereNull('unassigned_at')
                ->sortByDesc('id')
                ->first();
            /** @var User|null $supervisor */
            $supervisor = $active?->supervisor;
        } else {
            $supervisor = User::query()
                ->select('users.*')
                ->join('supervisor_assignments', 'supervisor_assignments.supervisor_id', '=', 'users.id')
                ->where('supervisor_assignments.volunteer_id', $person->getKey())
                ->whereNull('supervisor_assignments.unassigned_at')
                ->orderByDesc('supervisor_assignments.id')
                ->first();
        }

        return $supervisor === null ? null : [
            'id' => (int) $supervisor->id,
            'name' => $supervisor->fullName(),
        ];
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
