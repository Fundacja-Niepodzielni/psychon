<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * `php artisan psychon:sso-powiaz {userId} {sub}` — operator bootstrap for
 * stage E1 (the bridge): binds a local user to a Keycloak `sub` explicitly,
 * for the first admin and for existing dev-server accounts that predate the
 * invitation-token flow. No e-mail lookup — the operator names the row by
 * id, on purpose, matching the identity contract (bind by `sub`, never by
 * e-mail) from the other side.
 *
 * Refuses the same conflicts the `/sso/powiaz` endpoint refuses: an
 * inactive account, a user already bound to a different sub, or a sub
 * already bound to another user.
 */
class SsoPowiazCommand extends Command
{
    protected $signature = 'psychon:sso-powiaz {userId : Id lokalnego uzytkownika} {sub : Keycloak sub do powiazania}';

    protected $description = 'Wiąże lokalne konto z podanym Keycloak sub (bootstrap, bez wyszukiwania po e-mailu)';

    public function handle(): int
    {
        $userId = $this->argument('userId');
        $sub = $this->argument('sub');

        $user = User::query()->find($userId);

        if ($user === null) {
            $this->error("Nie znaleziono użytkownika o id {$userId}.");

            return self::FAILURE;
        }

        if (in_array($user->status, ['blocked', 'deleted'], true) || $user->anonymized_at !== null) {
            $this->error("Konto #{$user->id} jest zablokowane, usunięte lub zanonimizowane — nie można powiązać.");

            return self::FAILURE;
        }

        if ($user->keycloak_sub !== null && $user->keycloak_sub !== $sub) {
            $this->error("Konto #{$user->id} jest już powiązane z innym sub ({$user->keycloak_sub}).");

            return self::FAILURE;
        }

        $conflict = User::query()
            ->where('keycloak_sub', $sub)
            ->where('id', '!=', $user->id)
            ->first();

        if ($conflict !== null) {
            $this->error("Sub {$sub} jest już powiązany z innym użytkownikiem (#{$conflict->id}).");

            return self::FAILURE;
        }

        $user->forceFill([
            'keycloak_sub' => $sub,
            'activation_token' => null,
        ])->save();

        $this->info("Powiązano konto #{$user->id} ({$user->email}) z Keycloak sub {$sub}.");

        return self::SUCCESS;
    }
}
