<?php

namespace App\Services\H12;

use App\Models\SupervisionSlot;
use Illuminate\Support\Carbon;

/**
 * Jedno miejsce dla granic czasu superwizji: `SupervisionSignupService` i
 * `SupervisionAttendanceService` stosują dokładnie te warunki przy odmowie,
 * a zasoby H12 wołają te same metody, żeby front mógł wyłączyć przycisk,
 * zanim serwer go i tak odrzuci. Zegar bierzemy z `Carbon::now()` (serwer),
 * nigdy z pola przysłanego przez klienta.
 */
final class SupervisionTiming
{
    public static function canSignUp(SupervisionSlot $slot): bool
    {
        return Carbon::now()->lt($slot->starts_at);
    }

    public static function canMarkAttendance(SupervisionSlot $slot): bool
    {
        return ! Carbon::now()->lt(self::endsAt($slot));
    }

    private static function endsAt(SupervisionSlot $slot): Carbon
    {
        return $slot->starts_at->copy()->addMinutes((int) $slot->duration_minutes);
    }
}
