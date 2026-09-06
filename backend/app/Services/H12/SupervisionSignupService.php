<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class SupervisionSignupService
{
    public function signup(User $volunteer, int $slotId): SupervisionSlot
    {
        $slot = DB::transaction(function () use ($volunteer, $slotId): SupervisionSlot {
            $lockedVolunteer = User::query()->whereKey($volunteer->id)->lockForUpdate()->firstOrFail();
            $assignment = SupervisorAssignment::query()
                ->where('volunteer_id', $lockedVolunteer->id)
                ->whereNull('unassigned_at')
                ->orderByDesc('assigned_at')
                ->lockForUpdate()
                ->first();
            $slot = SupervisionSlot::query()->whereKey($slotId)->lockForUpdate()->first();

            if ($slot === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono terminu.');
            }

            if ($assignment === null || (int) $assignment->supervisor_id !== (int) $slot->supervisor_id) {
                throw new ApiException(
                    403,
                    'not_your_supervisor',
                    'Ten termin nie jest prowadzony przez Twojego superwizora.',
                );
            }

            if (! Carbon::now()->lt($slot->starts_at)) {
                throw new ApiException(
                    422,
                    'validation_failed',
                    'Na termin, który już się rozpoczął, nie można się zapisać.',
                );
            }

            $signup = SupervisionSignup::query()
                ->where('slot_id', $slot->id)
                ->where('user_id', $lockedVolunteer->id)
                ->lockForUpdate()
                ->first();

            if ($signup !== null && $signup->cancelled_at === null) {
                return $slot;
            }

            $activeCount = $slot->signups()->whereNull('cancelled_at')->count();
            if ($activeCount >= (int) $slot->seats_limit) {
                throw new ApiException(409, 'slot_full', 'Ten termin nie ma już wolnych miejsc.');
            }

            if ($signup === null) {
                SupervisionSignup::query()->create([
                    'slot_id' => $slot->id,
                    'user_id' => $lockedVolunteer->id,
                    'signed_up_at' => now(),
                ]);
            } else {
                $signup->forceFill([
                    'signed_up_at' => now(),
                    'cancelled_at' => null,
                    'attendance' => null,
                    'attendance_marked_by' => null,
                ])->save();
            }

            return $slot;
        });

        return $slot->fresh();
    }

    public function cancel(User $volunteer, int $slotId): SupervisionSlot
    {
        $slot = DB::transaction(function () use ($volunteer, $slotId): SupervisionSlot {
            $lockedVolunteer = User::query()->whereKey($volunteer->id)->lockForUpdate()->firstOrFail();
            $assignment = SupervisorAssignment::query()
                ->where('volunteer_id', $lockedVolunteer->id)
                ->whereNull('unassigned_at')
                ->orderByDesc('assigned_at')
                ->lockForUpdate()
                ->first();
            $slot = SupervisionSlot::query()->whereKey($slotId)->lockForUpdate()->first();

            if (
                $slot === null
                || $assignment === null
                || (int) $assignment->supervisor_id !== (int) $slot->supervisor_id
            ) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono zapisu.');
            }

            if (! Carbon::now()->lt($slot->starts_at)) {
                throw new ApiException(
                    422,
                    'validation_failed',
                    'Po rozpoczęciu terminu nie można się wypisać.',
                );
            }

            $signup = SupervisionSignup::query()
                ->where('slot_id', $slot->id)
                ->where('user_id', $lockedVolunteer->id)
                ->whereNull('cancelled_at')
                ->lockForUpdate()
                ->first();

            if ($signup === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono aktywnego zapisu.');
            }

            $signup->forceFill(['cancelled_at' => now()])->save();

            return $slot;
        });

        return $slot->fresh();
    }
}
