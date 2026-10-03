<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use App\Support\Settings;
use Illuminate\Support\Facades\DB;

final class ApplicationRejector
{
    public static function reject(Application|int $application, User $actor, string $reason): Application
    {
        return DB::transaction(function () use ($application, $actor, $reason): Application {
            $applicationId = $application instanceof Application ? $application->getKey() : $application;
            // Decyzje dotyczą wyłącznie aktywnej edycji: zgłoszenie innej edycji
            // daje to samo 404 co nieistniejące i co podgląd (`show`) — zanim
            // cokolwiek się zapisze i zanim wyjdzie wiadomość.
            $locked = Application::query()
                ->forEdition(Settings::activeEdition())
                ->whereKey($applicationId)
                ->lockForUpdate()
                ->first();

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

            // Powód jest wolnym tekstem i może zawierać dane osobowe, dlatego
            // zostaje w `applications.rejection_reason`, a wpis w rejestrze
            // niesie wyłącznie identyfikatory i decyzję.
            AuditLog::record($actor, 'application.rejected', $locked, [
                'application_id' => $locked->id,
                'decision' => 'rejected',
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
                '/admin/uczestniczki?zakladka=zgloszenia',
            );

            return $locked->fresh();
        });
    }
}
