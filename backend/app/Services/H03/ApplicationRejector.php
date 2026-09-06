<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Support\Facades\DB;

final class ApplicationRejector
{
    public static function reject(Application|int $application, User $actor, string $reason): Application
    {
        return DB::transaction(function () use ($application, $actor, $reason): Application {
            $applicationId = $application instanceof Application ? $application->getKey() : $application;
            $locked = Application::query()->whereKey($applicationId)->lockForUpdate()->first();

            if ($locked === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono zgłoszenia.');
            }

            if ($locked->status !== 'new') {
                throw new ApiException(409, 'application_already_decided', 'Zgłoszenie zostało już rozstrzygnięte.');
            }

            $decidedAt = now();
            $locked->forceFill([
                'status' => 'rejected',
                'rejection_reason' => $reason,
                'decided_by' => $actor->id,
                'decided_at' => $decidedAt,
            ])->save();

            AuditLog::record($actor, 'application.rejected', $locked, [
                'application_id' => $locked->id,
                'reason' => $reason,
            ]);

            // A new application has no User yet. Until the contract provides
            // an address-only Notify recipient, the decision actor receives
            // the in-app/e-mail event and remains the accountable recipient.
            $recipient = $locked->user()->first() ?? $actor;
            Notify::send(
                $recipient,
                'application.rejected',
                'Zgłoszenie odrzucone',
                'Zgłoszenie '.$locked->first_name.' '.$locked->last_name.' zostało odrzucone. Powód: '.$reason,
                '/admin/uczestniczki',
            );

            return $locked->fresh();
        });
    }
}
