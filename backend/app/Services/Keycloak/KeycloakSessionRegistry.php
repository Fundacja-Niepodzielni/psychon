<?php

namespace App\Services\Keycloak;

use Illuminate\Support\Facades\DB;

/**
 * Bookkeeping for "our own session", in a backend that is otherwise a pure
 * per-request bearer-token resource server: `AuthenticateKeycloakToken`
 * validates a fresh JWT on every request and keeps no server-side session
 * of its own. Back-channel logout's point 5 ("destroy our own sessions
 * before answering") needs something concrete to destroy — this table is
 * exactly that, and nothing more.
 *
 * NEVER consulted for authorization. `sub` and `roles` always come straight
 * from the token (identity contract, the disagreement guarantee proved in
 * slice 1) — this class cannot participate in an access decision, only in
 * bookkeeping and in giving the read path something to leave alone during a
 * marker-store outage (point 7).
 */
final class KeycloakSessionRegistry
{
    private const TABLE = 'keycloak_sessions';

    /**
     * Records that `$sid` was just seen, bound to `$sub`. Called by the read
     * path only after a HEALTHY store found no marker (point 6's positive
     * control) — never on a store failure, and never as part of an access
     * decision.
     */
    public function touch(string $sid, string $sub): void
    {
        DB::table(self::TABLE)->updateOrInsert(
            ['sid' => $sid],
            ['sub' => $sub, 'created_at' => now()],
        );
    }

    /**
     * Deletes the session bound to `$sid`; when `$sid` is `null` (the
     * `SKIPPED` case — logout by `sub` alone), deletes every session
     * recorded for `$sub` instead, since none of them carry the `sid` that
     * would have let us target just one.
     */
    public function destroy(?string $sid, ?string $sub): int
    {
        if ($sid !== null && $sid !== '') {
            return DB::table(self::TABLE)->where('sid', $sid)->delete();
        }

        if ($sub !== null && $sub !== '') {
            return DB::table(self::TABLE)->where('sub', $sub)->delete();
        }

        return 0;
    }

    public function exists(string $sid): bool
    {
        return DB::table(self::TABLE)->where('sid', $sid)->exists();
    }
}
