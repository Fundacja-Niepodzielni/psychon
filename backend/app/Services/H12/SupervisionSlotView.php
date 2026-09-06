<?php

namespace App\Services\H12;

use App\Models\SupervisionSlot;
use App\Models\User;

final class SupervisionSlotView
{
    public static function participant(SupervisionSlot $slot, User $user): SupervisionSlot
    {
        return $slot
            ->load([
                'signups' => fn ($query) => $query
                    ->where('user_id', $user->id)
                    ->whereNull('cancelled_at'),
            ])
            ->loadCount([
                'signups as active_signups_count' => fn ($query) => $query->whereNull('cancelled_at'),
            ]);
    }

    public static function instructor(SupervisionSlot $slot): SupervisionSlot
    {
        return $slot
            ->load([
                'signups' => fn ($query) => $query
                    ->with('user')
                    ->whereNull('cancelled_at')
                    ->orderBy('user_id'),
            ])
            ->loadCount([
                'signups as active_signups_count' => fn ($query) => $query->whereNull('cancelled_at'),
            ]);
    }
}
