<?php

namespace App\Services\Keycloak;

use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The invalidation-marker store for back-channel logout (contract §4.5 /
 * §4.5a). A row keyed by `sid` is a negative security assertion: its
 * PRESENCE is what decides invalidation — never its content, never how long
 * ago it was written. This class never reads any timestamp back to decide
 * "still valid" — that would resurrect exactly the defect §4.5a exists to
 * name (a stale marker silently starts admitting people).
 *
 * ============================================================================
 * WHY BOTH PATHS RETURN A VERDICT, NEVER A BOOL — the consumer note (point 2
 * and point 6).
 * ============================================================================
 * `mark()`'s previous shape (`bool`) made "token had no `sid`" (a CORRECT
 * case — logout by `sub` alone, OIDC BCL 1.0) indistinguishable from "the
 * write failed" (an outage). A naive `if (!$ok) return 503;` would redden
 * every correct sub-only logout. `verdict()`'s previous shape made "no
 * marker" indistinguishable from "cannot tell" — and at a negative security
 * assertion, "cannot tell" must mean refuse, never admit.
 */
final class InvalidationStore
{
    public const WRITE_WRITTEN = 'WRITTEN';

    public const WRITE_SKIPPED = 'SKIPPED';

    public const WRITE_FAILED = 'FAILED';

    public const READ_ABSENT = 'ABSENT';

    public const READ_MARKED = 'MARKED';

    public const READ_FAILURE = 'FAILURE';

    private const TABLE = 'keycloak_logout_markers';

    /**
     * Writes the marker for `$sid` and returns a decision — never a bare
     * success/failure bit (point 2). `$sid === null` is the correct
     * sub-only-logout case (`WRITE_SKIPPED`), never `WRITE_FAILED`.
     *
     * Point 1: a write call that does not throw is not proof the marker
     * exists — a full disk under a buffered driver, a read-only replica
     * silently accepting statements, or any number of storage failures can
     * return "success" without a durable row. The row is read back before
     * this method calls itself `WRITTEN`.
     *
     * @return array{state:string, reason:?string}
     */
    public function mark(?string $sid): array
    {
        if ($sid === null || $sid === '') {
            return ['state' => self::WRITE_SKIPPED, 'reason' => 'logout token carried no sid — nothing to mark'];
        }

        try {
            DB::table(self::TABLE)->updateOrInsert(['sid' => $sid], ['created_at' => now()]);
        } catch (Throwable $e) {
            return ['state' => self::WRITE_FAILED, 'reason' => $this->describe($e)];
        }

        try {
            $written = DB::table(self::TABLE)->where('sid', $sid)->exists();
        } catch (Throwable $e) {
            return ['state' => self::WRITE_FAILED, 'reason' => $this->describe($e)];
        }

        if (! $written) {
            return ['state' => self::WRITE_FAILED, 'reason' => 'write reported success but the row does not read back'];
        }

        return ['state' => self::WRITE_WRITTEN, 'reason' => null];
    }

    /**
     * Reads the verdict for `$sid` — never a bare bool (point 6). A `$sid`
     * of `null` means there is nothing to look up (not a store failure).
     * A store that cannot be queried returns `READ_FAILURE`, which the read
     * path (`AuthenticateKeycloakToken`) treats as "not invalidated →
     * refuse" — never as "no marker → let in".
     *
     * @return array{state:string, reason:?string}
     */
    public function verdict(?string $sid): array
    {
        if ($sid === null || $sid === '') {
            return ['state' => self::READ_ABSENT, 'reason' => null];
        }

        try {
            $marked = DB::table(self::TABLE)->where('sid', $sid)->exists();
        } catch (Throwable $e) {
            return ['state' => self::READ_FAILURE, 'reason' => $this->describe($e)];
        }

        return $marked
            ? ['state' => self::READ_MARKED, 'reason' => null]
            : ['state' => self::READ_ABSENT, 'reason' => null];
    }

    private function describe(Throwable $e): string
    {
        return $e->getMessage();
    }
}
