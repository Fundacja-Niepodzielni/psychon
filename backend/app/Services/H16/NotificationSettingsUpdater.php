<?php

namespace App\Services\H16;

use App\Models\Setting;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\NotificationSettings;
use Illuminate\Support\Facades\DB;

/**
 * Zapisuje ustawienia powiadomień administracji i audytuje zmianę.
 * Ładunek audytu niesie wyłącznie kody typów, flagi i godzinę — bez
 * wolnego tekstu (errata kontraktu 2026-09-18), więc bez „Kontaktu
 * w e-mailach”, który administracja wpisuje ręcznie.
 */
final class NotificationSettingsUpdater
{
    /**
     * @param  array<string, mixed>  $validated
     * @return array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}, email_contact: ?string}
     */
    public static function update(array $validated, User $actor): array
    {
        return DB::transaction(function () use ($validated, $actor): array {
            $merged = NotificationSettings::put($validated);

            $row = Setting::query()->where('key', NotificationSettings::KEY)->first();

            AuditLog::record($actor, 'notification_settings.updated', $row, [
                'types' => $merged['types'],
                'supervision_reminder' => $merged['supervision_reminder'],
            ]);

            return $merged;
        });
    }
}
