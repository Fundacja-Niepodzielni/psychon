<?php

namespace App\Http\Controllers\Oidc;

use App\Http\Controllers\Controller;
use App\Services\Keycloak\BackchannelLogoutAlarm;
use App\Services\Keycloak\InvalidationStore;
use App\Services\Keycloak\KeycloakSessionRegistry;
use App\Services\Keycloak\LogoutTokenValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * `POST /oidc/backchannel-logout` — OIDC Back-Channel Logout 1.0 (contract
 * §4.5 / §4.5a). Docs cited by the class-level comment on
 * `App\Services\Keycloak\InvalidationStore` and this method's own comments.
 *
 * Two halves, in the order the contract requires (§4.5, "dopiero po
 * komplecie — i dokładnie w tej kolejności"):
 *   1. validate the logout token in full (never short-circuited — every
 *      failing check is named in the `400` response);
 *   2. write the invalidation marker, destroy PsychON's own session
 *      bookkeeping regardless of what the marker write did, THEN decide the
 *      response — never the other order, or a slow write could let a
 *      not-yet-invalidated request slip through the gap.
 */
class BackchannelLogoutController extends Controller
{
    public function __construct(
        private readonly LogoutTokenValidator $validator,
        private readonly InvalidationStore $markers,
        private readonly KeycloakSessionRegistry $sessions,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $logoutToken = (string) $request->input('logout_token', '');

        $result = $this->validator->validate($logoutToken);

        if (! $result['ok']) {
            return $this->noStore(response()->json([
                'error' => [
                    'status' => 400,
                    'code' => 'invalid_request',
                    'message' => 'The logout token failed OIDC Back-Channel Logout 1.0 validation.',
                    'reason' => ['failed' => $result['failed']],
                ],
            ], 400));
        }

        $claims = $result['claims'];
        $sid = isset($claims['sid']) ? (string) $claims['sid'] : null;
        $sub = isset($claims['sub']) ? (string) $claims['sub'] : null;

        // Point 1 + point 2: write the marker and get back a DECISION
        // (WRITTEN / SKIPPED / FAILED), never a bare bool — see
        // `InvalidationStore::mark()` for why a bool was the defect.
        $decision = $this->markers->mark($sid);

        // Point 5: destroy PsychON's own session bookkeeping BEFORE the
        // response is decided, and UNCONDITIONALLY — whatever the marker
        // write did. A missing marker must never mean "the user stays
        // logged in"; this call runs on WRITTEN, SKIPPED and FAILED alike.
        // Wrapped defensively: an unrelated failure in this bookkeeping
        // table must never block the correctly-computed marker response
        // from reaching Keycloak (which, measured, does not retry — the
        // marker response IS the only signal that matters here).
        $killed = 0;
        try {
            $killed = $this->sessions->destroy($sid, $sub);
        } catch (Throwable $e) {
            Log::warning('keycloak.backchannel_logout.session_cleanup_failed', [
                'message' => $e->getMessage(),
            ]);
        }

        if ($decision['state'] === InvalidationStore::WRITE_FAILED) {
            // Point 4: the real remedy. Measured on Keycloak 26.7.0
            // (contract §4.5): after a 503 the IdP delivers once and never
            // retries or logs, so the status code below is honest but
            // cosmetic — this alarm is the only thing that reaches anyone.
            BackchannelLogoutAlarm::raise('write', $decision['reason'], ['sid' => $sid]);

            // Point 3: 503, Cache-Control: no-store. Never a 2xx when the
            // write failed — a naive unconditional 200 is the exact defect
            // this slice exists to close (Keycloak takes 200 as "done" and
            // never asks again).
            return $this->noStore(response()->json([
                'error' => [
                    'status' => 503,
                    'code' => 'invalidation_marker_not_written',
                    'message' => 'Local sessions were terminated, but the logout marker could not be recorded.',
                    'reason' => ['cause' => $decision['reason']],
                ],
            ], 503));
        }

        // WRITTEN or SKIPPED both answer 200 — point 2's whole point is that
        // SKIPPED (no `sid`, a correct sub-only logout) is not a failure and
        // must not be reddened by branching on it the same way as FAILED.
        return $this->noStore(response()->json([
            'ok' => true,
            'decision' => $decision['state'],
            'killed' => $killed,
        ]));
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        return $response->header('Cache-Control', 'no-store');
    }
}
