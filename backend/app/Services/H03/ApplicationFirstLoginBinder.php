<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\User;
use App\Services\Keycloak\KeycloakPrincipal;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Pierwsze logowanie osoby z przyjętego zgłoszenia: wiąże `sub` z kontem
 * lokalnym w stanie `invited` i przełącza je na `active`.
 *
 * Wiązanie następuje wyłącznie przy trzech warunkach naraz:
 *  1. `iss` tokena równy wystawcy z konfiguracji (sprawdza już middleware
 *     `auth.keycloak`; tu powtórzone, bo od tego zależy zaufanie do adresu),
 *  2. `email_verified === true`,
 *  3. adres z tokena po normalizacji równy adresowi przyjętego zgłoszenia.
 *
 * Podpis, odbiorcę i ważność tokena sprawdził middleware na tym samym
 * nagłówku, więc tutaj odczytujemy tylko treść już zweryfikowanego tokena.
 * Odmowy nie niosą żadnej wartości z tokena (ani adresu, ani `sub`).
 */
final class ApplicationFirstLoginBinder
{
    public static function bind(KeycloakPrincipal $principal, string $bearerToken): User
    {
        $claims = self::claims($bearerToken);

        if (! isset($claims->iss) || $claims->iss !== (string) config('keycloak.issuer')) {
            throw new ApiException(401, 'invalid_token', 'Token dostępu jest nieprawidłowy lub wygasł.');
        }

        if (($claims->email_verified ?? null) !== true) {
            throw new ApiException(
                403,
                'email_not_verified',
                'Adres e-mail w Kontach Niepodzielni nie jest jeszcze potwierdzony. Potwierdź go linkiem z wiadomości i zaloguj się ponownie.',
            );
        }

        $email = is_string($claims->email ?? null) && trim($claims->email) !== ''
            ? ApplicationEmailNormalizer::normalize($claims->email)
            : null;

        return DB::transaction(function () use ($principal, $email): User {
            $already = User::query()->where('keycloak_sub', $principal->sub)->lockForUpdate()->first();

            $application = $email === null ? null : Application::query()
                ->status('accepted')
                ->whereNotNull('user_id')
                ->whereRaw('LOWER(email) = ?', [$email])
                ->orderByDesc('decided_at')
                ->first();

            if ($application === null) {
                throw new ApiException(
                    404,
                    'invitation_not_found',
                    'Nie znaleziono zaproszenia dla adresu e-mail z tego konta Niepodzielni. Zaloguj się kontem założonym na adres, na który przyszło zaproszenie.',
                );
            }

            $user = User::query()->whereKey($application->user_id)->lockForUpdate()->first();

            if ($user === null || $user->anonymized_at !== null || in_array($user->status, ['blocked', 'deleted'], true)) {
                throw new ApiException(403, 'forbidden', 'To konto nie jest aktywne. Skontaktuj się z opiekunem projektu.');
            }

            if ($already !== null && $already->id !== $user->id) {
                throw new ApiException(
                    409,
                    'sub_already_bound',
                    'To konto Niepodzielni jest już połączone z innym użytkownikiem.',
                );
            }

            if ($user->keycloak_sub !== null && $user->keycloak_sub !== $principal->sub) {
                throw new ApiException(
                    409,
                    'already_bound',
                    'To zaproszenie jest już połączone z innym kontem Niepodzielni.',
                );
            }

            if ($user->keycloak_sub === $principal->sub && $user->status === 'active') {
                return $user;
            }

            $user->forceFill([
                'keycloak_sub' => $principal->sub,
                'status' => 'active',
                'activation_token' => null,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            return $user;
        });
    }

    private static function claims(string $bearerToken): object
    {
        $parts = explode('.', $bearerToken);

        try {
            $claims = JWT::jsonDecode(JWT::urlsafeB64Decode($parts[1] ?? ''));
        } catch (Throwable) {
            $claims = null;
        }

        if (! is_object($claims)) {
            throw new ApiException(401, 'invalid_token', 'Token dostępu jest nieprawidłowy lub wygasł.');
        }

        return $claims;
    }
}
