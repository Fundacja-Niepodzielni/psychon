<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ApplicationAcceptor
{
    /**
     * Accept an application atomically, including the invitation side effect.
     * The application is locked before its edition to keep lock ordering
     * stable under concurrent accept requests.
     *
     * @return array{user_id:int, access_expires_at:string}
     */
    public static function accept(Application|int $application, User $actor, array $input): array
    {
        return DB::transaction(function () use ($application, $actor, $input): array {
            $applicationId = $application instanceof Application ? $application->getKey() : $application;
            $locked = Application::query()->whereKey($applicationId)->lockForUpdate()->first();

            if ($locked === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono zgłoszenia.');
            }

            if ($locked->status !== 'new') {
                throw new ApiException(409, 'application_already_decided', 'Zgłoszenie zostało już rozstrzygnięte.');
            }

            $edition = $locked->edition()->lockForUpdate()->first();
            if ($edition === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono edycji zgłoszenia.');
            }

            $email = ApplicationEmailNormalizer::normalize($locked->email);
            $existing = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

            if ($existing !== null) {
                throw new ApiException(
                    409,
                    'email_already_registered',
                    'Na ten adres jest już zarejestrowane konto.',
                    reason: ['existing_user_id' => $existing->id],
                );
            }

            $capacity = $edition->seats_limit;
            $active = $edition->users()->where('status', 'active')->count();
            $requested = 1;

            if ($capacity !== null && $active + $requested > $capacity && ! (bool) ($input['force'] ?? false)) {
                throw new ApiException(
                    409,
                    'edition_capacity_exceeded',
                    'Limit miejsc w edycji został przekroczony.',
                    reason: [
                        'capacity' => $capacity,
                        'active' => $active,
                        'requested' => $requested,
                    ],
                );
            }

            $decidedAt = now();
            $expiresAt = $decidedAt->copy()->addMonths(6);
            $token = Str::random(64);
            $activationPath = '/aktywacja?token='.$token;
            $activationUrl = rtrim(config('app.frontend_url'), '/').$activationPath;

            $user = User::query()->create([
                'first_name' => $locked->first_name,
                'last_name' => $locked->last_name,
                'email' => $email,
                'password' => null,
                'phone' => $locked->phone,
                'role' => $input['role'],
                'status' => 'active',
                'edition_id' => $edition->id,
                'access_expires_at' => $expiresAt,
                'activation_token' => $token,
                'product_group' => 'psychon',
            ]);

            $locked->forceFill([
                'status' => 'accepted',
                'decided_by' => $actor->id,
                'decided_at' => $decidedAt,
                'user_id' => $user->id,
            ])->save();

            AuditLog::record($actor, 'application.accepted', $locked, [
                'application_id' => $locked->id,
                'user_id' => $user->id,
                'role' => $user->role,
                'force' => (bool) ($input['force'] ?? false),
            ]);

            Notify::send(
                $user,
                'application.accepted',
                'Zgłoszenie zaakceptowane',
                'Twoje zgłoszenie zostało zaakceptowane. Ustaw hasło, aby aktywować konto. Link: '
                    .$activationUrl,
                $activationPath,
            );

            return [
                'user_id' => $user->id,
                'access_expires_at' => $expiresAt->toIso8601ZuluString(),
            ];
        });
    }
}
