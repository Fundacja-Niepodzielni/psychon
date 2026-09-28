<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H16\UpdateNotificationSettingsRequest;
use App\Services\H16\NotificationSettingsUpdater;
use App\Support\NotificationSettings;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H16 · GET/PATCH /admin/notification-settings.
 *
 * Wyjątek singletonowy jak `/admin/edition` i `/admin/onboarding` — jedna
 * edycja naraz, trasa nie przyjmuje identyfikatora. Dostęp: `project_manager`,
 * `super_admin` (bramka roli w routes/api/h16.php).
 */
class NotificationSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->payload(NotificationSettings::get())]);
    }

    public function update(UpdateNotificationSettingsRequest $request): JsonResponse
    {
        $merged = NotificationSettingsUpdater::update($request->validated(), $request->user());

        return response()->json(['data' => $this->payload($merged)]);
    }

    /**
     * @param  array{types: array<string, bool>, supervision_reminder: array{enabled: bool, send_at: string}}  $state
     * @return array{types: list<array{type: string, enabled: bool}>, supervision_reminder: array{enabled: bool, send_at: string}}
     */
    private function payload(array $state): array
    {
        $types = [];
        foreach ($state['types'] as $type => $enabled) {
            $types[] = ['type' => $type, 'enabled' => $enabled];
        }

        return [
            'types' => $types,
            'supervision_reminder' => $state['supervision_reminder'],
        ];
    }
}
