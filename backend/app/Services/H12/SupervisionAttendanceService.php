<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class SupervisionAttendanceService
{
    public function update(User $actor, int $slotId, array $attendance): SupervisionSlot
    {
        return DB::transaction(function () use ($actor, $slotId, $attendance): SupervisionSlot {
            $slot = SupervisionSlot::query()->whereKey($slotId)->lockForUpdate()->first();

            if ($slot === null || ($actor->role === 'instructor' && (int) $slot->supervisor_id !== (int) $actor->id)) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono terminu.');
            }

            if (Carbon::now()->lt($slot->starts_at->copy()->addMinutes((int) $slot->duration_minutes))) {
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
                $signups->get((int) $userId)->forceFill([
                    'attendance' => $value,
                    'attendance_marked_by' => $actor->id,
                ])->save();
            }

            return $slot;
        });
    }
}
