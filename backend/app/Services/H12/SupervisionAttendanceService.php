<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;

final class SupervisionAttendanceService
{
    public function __construct(private readonly TokenRoles $tokenRoles) {}

    public function update(User $actor, int $slotId, array $attendance): SupervisionSlot
    {
        return DB::transaction(function () use ($actor, $slotId, $attendance): SupervisionSlot {
            $slot = $this->scopedSlot($actor, $slotId, lock: true);

            if (! SupervisionTiming::canMarkAttendance($slot)) {
                throw new ApiException(
                    422,
                    'validation_failed',
                    'Obecność można oznaczyć dopiero po zakończeniu terminu.',
                );
            }

            $userIds = [];
            foreach (array_keys($attendance) as $key) {
                if (! ctype_digit((string) $key) || (int) $key < 1) {
                    throw new ApiException(
                        422,
                        'validation_failed',
                        'Lista obecności zawiera nieprawidłową osobę.',
                        errors: ['attendance' => ['Identyfikatory osób muszą być dodatnimi liczbami całkowitymi.']],
                    );
                }

                $userIds[] = (int) $key;
            }

            $signups = SupervisionSignup::query()
                ->where('slot_id', $slot->id)
                ->whereIn('user_id', $userIds)
                ->whereNull('cancelled_at')
                ->orderBy('user_id')
                ->lockForUpdate()
                ->get()
                ->keyBy('user_id');

            if ($signups->count() !== count($userIds)) {
                throw new ApiException(
                    422,
                    'validation_failed',
                    'Lista obecności zawiera osobę bez aktywnego zapisu.',
                );
            }

            foreach ($attendance as $userId => $value) {
                $signup = $signups->get((int) $userId);
                $before = $signup->attendance;

                if ($before === $value) {
                    continue;
                }

                $signup->forceFill([
                    'attendance' => $value,
                    'attendance_marked_by' => $actor->id,
                ])->save();

                AuditLog::record($actor, 'supervision.attendance_marked', $signup, [
                    'slot_id' => $slot->id,
                    'user_id' => (int) $userId,
                    'attendance_before' => $before,
                    'attendance_after' => $value,
                ]);
            }

            return $slot;
        });
    }

    /**
     * The slot the actor may mark attendance on, or one 404 for everything
     * else: unknown slot, cancelled slot and (for an instructor) somebody
     * else's slot are indistinguishable. `UpdateAttendanceRequest::authorize()`
     * calls this without a lock BEFORE the body is validated; `update()`
     * calls it again under the row lock.
     */
    public function scopedSlot(User $actor, int $slotId, bool $lock = false): SupervisionSlot
    {
        $query = SupervisionSlot::query()->whereKey($slotId);

        if ($lock) {
            $query->lockForUpdate();
        }

        $slot = $query->first();

        // R2 (sprint-2 §1): this is a scoping rule on top of the route's
        // `role:instructor` gate — an instructor may only mark attendance
        // for their OWN slot — so it has to ask the same access-token
        // question the gate already answered, never the local row.
        if (
            $slot === null
            || $slot->isCancelled()
            || ($this->tokenRoles->has('instructor') && (int) $slot->supervisor_id !== (int) $actor->id)
        ) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono terminu.');
        }

        return $slot;
    }
}
