<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\Consent;
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
     * Konto lokalne powstaje w stanie `invited` (zaproszone): nie ma jeszcze
     * `keycloak_sub`, staje się `active` dopiero przy pierwszym logowaniu
     * (`ApplicationFirstLoginBinder`). Wiadomość e-mail wychodzi po
     * zatwierdzeniu transakcji, najwyżej raz na przyjęte zgłoszenie: drugie
     * przyjęcie tego samego zgłoszenia kończy się 409 przed wysyłką.
     *
     * @return array{user_id:int, access_expires_at:string, invitation_mail:string}
     */
    public static function accept(Application|int $application, User $actor, array $input): array
    {
        [$locked, $user, $expiresAt, $activationUrl] = DB::transaction(function () use ($application, $actor, $input): array {
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

            // Zaproszone konta zajmują miejsce tak samo jak aktywne.
            $capacity = $edition->seats_limit;
            $active = $edition->users()->whereIn('status', ['active', 'invited'])->count();
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
                'phone' => $locked->phone,
                'role' => $input['role'],
                'status' => 'invited',
                'edition_id' => $edition->id,
                'access_expires_at' => $expiresAt,
                'activation_token' => $token,
                'product_group' => 'psychon',
            ]);

            foreach (Application::CONSENT_COLUMNS as $type => $column) {
                if ($locked->{$column} !== null) {
                    Consent::query()->create([
                        'user_id' => $user->id,
                        'type' => $type,
                        'granted_at' => $locked->{$column},
                    ]);
                }
            }

            $locked->forceFill([
                'status' => 'accepted',
                'decided_by' => $actor->id,
                'decided_at' => $decidedAt,
                'user_id' => $user->id,
            ])->save();

            AuditLog::record($actor, 'application.accepted', $locked, [
                'application_id' => $locked->id,
                'decision' => 'accepted',
                'user_id' => $user->id,
                'role' => $user->role,
                'force' => (bool) ($input['force'] ?? false),
            ]);

            Notify::send(
                $user,
                'application.accepted',
                'Zgłoszenie zaakceptowane',
                'Twoje zgłoszenie zostało zaakceptowane. Połącz konto z kontem Niepodzielni, aby je aktywować. Link: '
                    .$activationUrl,
                $activationPath,
            );

            return [$locked, $user, $expiresAt, $activationUrl];
        });

        $sent = ApplicationInvitationMailer::send($locked, $user, $activationUrl);

        return [
            'user_id' => $user->id,
            'access_expires_at' => $expiresAt->toIso8601ZuluString(),
            'invitation_mail' => $sent ? 'sent' : 'failed',
        ];
    }
}
