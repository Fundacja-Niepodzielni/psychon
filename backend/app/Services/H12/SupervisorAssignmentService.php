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
     * Jedyny kod powodu odmowy przy przypisaniu wielu osób: osoby nie można
     * przypisać (`canBeAssigned()` zwraca false). Jeden kod dla wszystkich tych
     * przypadków, tak jak trasa pojedyncza ma dla nich jedną odpowiedź `422`.
     */
    public const string REASON_NOT_ASSIGNABLE = 'not_assignable';

    /** Odmowa, gdy wskazane konto nie może być prowadzącym — ta sama na obu trasach. */
    public const string SUPERVISOR_NOT_ALLOWED = 'Prowadzącym może być tylko aktywne konto z rolą prowadzącego.';

    /** Odmowa trasy pojedynczej, gdy osobie nie można nadać prowadzącego. */
    public const string PERSON_NOT_ASSIGNABLE = 'Prowadzącego można nadać tylko wolontariuszowi, którego konto nie jest zablokowane ani usunięte.';

    /**
     * Kto może być prowadzącym — jeden warunek dla przypisania jednej osobie
     * (`assign()`) i wielu osobom naraz (`AssignSupervisorToManyRequest`):
     * aktywne, niezanonimizowane konto z rolą prowadzącego.
     *
     * @phpstan-assert-if-true User $supervisor
     */
    public static function canSupervise(?User $supervisor): bool
    {
        return $supervisor !== null
            && $supervisor->role === 'instructor'
            && $supervisor->status === 'active'
            && $supervisor->anonymized_at === null;
    }

    /**
     * Komu można nadać prowadzącego — jeden warunek dla obu tras, bo obie
     * przechodzą przez `assign()`: wolontariusz, którego konto nie jest
     * zablokowane, usunięte ani zanonimizowane.
     */
    public static function canBeAssigned(User $person): bool
    {
        return $person->role === 'volunteer'
            && ! in_array($person->status, ['blocked', 'deleted'], true)
            && $person->anonymized_at === null;
    }

    /**
     * Przypisanie nadaje wyłącznie administracja
     * (`AdminSupervisionController::assignSupervisor`). Każde zamknięte przy tym
     * dotychczasowe przypisanie zapisuje w dzienniku `supervisor.unassigned`,
     * nowe — `supervisor.assigned`; ładunek obu to wyłącznie identyfikatory.
     * Prowadzący musi spełniać `canSupervise()`, osoba — `canBeAssigned()`;
     * inaczej `422 validation_failed` i nic nie zostaje zapisane.
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
            if (! self::canSupervise($supervisor)) {
                throw new ApiException(422, 'validation_failed', self::SUPERVISOR_NOT_ALLOWED);
            }

            if (! self::canBeAssigned($volunteer)) {
                throw new ApiException(422, 'validation_failed', self::PERSON_NOT_ASSIGNABLE);
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

    /**
     * Przypisanie jednego prowadzącego wielu osobom naraz
     * (`AdminSupervisionController::assignSupervisorToMany`). Dla każdej osoby
     * woła `assign()` z tymi samymi argumentami co trasa pojedyncza
     * (`AdminSupervisionController::assignSupervisor`), każdą osobę we własnej
     * transakcji — więc wpisy w dzienniku, zamknięcie poprzedniego
     * przypisania i warunki dla osoby (`canBeAssigned()`) są dokładnie te same.
     * Odmowa przy jednej osobie nie cofa pozostałych. Wynik w kolejności
     * żądania: `assigned`, `unchanged` (ten sam prowadzący już był, bez wpisu
     * w dzienniku), `refused` z kodem `not_assignable` albo `not_found`.
     *
     * @param  list<int>  $volunteerIds
     * @return list<array{user_id: int, result: string, reason: string|null}>
     */
    public function assignToMany(User $actor, int $supervisorId, array $volunteerIds): array
    {
        $results = [];

        foreach ($volunteerIds as $volunteerId) {
            $results[] = ['user_id' => $volunteerId, ...$this->assignOneOfMany($actor, $volunteerId, $supervisorId)];
        }

        return $results;
    }

    /**
     * @return array{result: string, reason: string|null}
     */
    private function assignOneOfMany(User $actor, int $volunteerId, int $supervisorId): array
    {
        try {
            $assignment = $this->assign($actor, $volunteerId, $supervisorId);
        } catch (ApiException $exception) {
            // Te same dwa rozróżnienia co trasa pojedyncza: 404 albo odmowa bez szczegółu.
            return $exception->status === 404
                ? ['result' => 'not_found', 'reason' => null]
                : ['result' => 'refused', 'reason' => self::REASON_NOT_ASSIGNABLE];
        }

        return ['result' => $assignment->wasRecentlyCreated ? 'assigned' : 'unchanged', 'reason' => null];
    }

    /**
     * Bieżący prowadzący osoby (aktywne przypisanie) albo `null` — pole tylko
     * do odczytu na liście osób i na karcie osoby. Gdy wołający wczytał już
     * relację `supervisorAssignments` z prowadzącym (lista osób), nie ma
     * dodatkowego zapytania; inaczej jedno zapytanie (karta jednej osoby).
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
}
