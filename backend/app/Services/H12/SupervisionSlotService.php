<?php

namespace App\Services\H12;

use App\Exceptions\ApiException;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Single place for writing supervision slots. The instructor creates slots
 * through `create()`; administration edits and cancels them through
 * `update()` and `cancel()`. All three share the same "must start in the
 * future" rule, so neither controller carries its own copy.
 */
final class SupervisionSlotService
{
    public const int DEFAULT_DURATION_MINUTES = 90;

    public const int DEFAULT_SEATS_LIMIT = 3;

    public const string CANCELLED_NOTIFICATION_TYPE = 'supervision.slot_cancelled';

    public const string CANCELLED_AUDIT_ACTION = 'supervision.slot_cancelled';

    /**
     * @param  array{starts_at: string, duration_minutes?: int, seats_limit?: int, location_or_link?: string|null}  $data
     */
    public function create(User $supervisor, array $data): SupervisionSlot
    {
        return SupervisionSlot::query()->create([
            'supervisor_id' => $supervisor->id,
            'starts_at' => self::futureStart($data['starts_at']),
            'duration_minutes' => $data['duration_minutes'] ?? self::DEFAULT_DURATION_MINUTES,
            'seats_limit' => $data['seats_limit'] ?? self::DEFAULT_SEATS_LIMIT,
            'location_or_link' => $data['location_or_link'] ?? null,
        ]);
    }

    /**
     * @param  array{starts_at?: string, duration_minutes?: int, seats_limit?: int, location_or_link?: string|null}  $data
     */
    public function update(int $slotId, array $data): SupervisionSlot
    {
        return DB::transaction(function () use ($slotId, $data): SupervisionSlot {
            $slot = self::lockUpcoming($slotId, 'Rozpoczętego terminu nie można zmienić.');

            $changes = [];

            if (array_key_exists('starts_at', $data)) {
                $changes['starts_at'] = self::futureStart($data['starts_at']);
            }

            foreach (['duration_minutes', 'seats_limit', 'location_or_link'] as $field) {
                if (array_key_exists($field, $data)) {
                    $changes[$field] = $data[$field];
                }
            }

            if (array_key_exists('seats_limit', $changes)) {
                $active = $slot->signups()->whereNull('cancelled_at')->count();

                if ((int) $changes['seats_limit'] < $active) {
                    $message = "Limit miejsc nie może być mniejszy niż liczba zapisanych osób ({$active}).";

                    throw new ApiException(422, 'validation_failed', $message, errors: ['seats_limit' => [$message]]);
                }
            }

            $slot->fill($changes)->save();

            return $slot;
        });
    }

    /**
     * Cancels an upcoming slot: every active signup is notified and released,
     * the cancellation is recorded in the audit log, and the slot is removed.
     *
     * @return int number of signups that were released
     */
    public function cancel(User $actor, int $slotId): int
    {
        return DB::transaction(function () use ($actor, $slotId): int {
            $slot = self::lockUpcoming($slotId, 'Rozpoczętego terminu nie można odwołać.');

            $signups = $slot->signups()
                ->with('user')
                ->whereNull('cancelled_at')
                ->orderBy('user_id')
                ->lockForUpdate()
                ->get();

            $when = $slot->starts_at->format('d.m.Y, H:i');

            foreach ($signups as $signup) {
                /** @var SupervisionSignup $signup */
                Notify::send(
                    $signup->user,
                    self::CANCELLED_NOTIFICATION_TYPE,
                    'Termin superwizji odwołany',
                    "Termin superwizji {$when} został odwołany. Zapisz się na inny termin.",
                    '/panel/superwizja',
                );
            }

            $released = $slot->signups()->whereNull('cancelled_at')->update(['cancelled_at' => now()]);

            AuditLog::record($actor, self::CANCELLED_AUDIT_ACTION, $slot, [
                'slot_id' => (int) $slot->id,
                'supervisor_id' => (int) $slot->supervisor_id,
                'signups_released' => $released,
            ]);

            $slot->delete();

            return $released;
        });
    }

    private static function lockUpcoming(int $slotId, string $startedMessage): SupervisionSlot
    {
        $slot = SupervisionSlot::query()->whereKey($slotId)->lockForUpdate()->first();

        if ($slot === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono terminu.');
        }

        if (! SupervisionTiming::canSignUp($slot)) {
            throw new ApiException(422, 'validation_failed', $startedMessage);
        }

        return $slot;
    }

    private static function futureStart(string $startsAt): Carbon
    {
        $parsed = Carbon::parse($startsAt)->utc();

        if (! $parsed->isFuture()) {
            $message = 'Termin musi rozpoczynać się w przyszłości.';

            throw new ApiException(422, 'validation_failed', $message, errors: ['starts_at' => [$message]]);
        }

        return $parsed;
    }
}
