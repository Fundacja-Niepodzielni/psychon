<?php

namespace App\Services\Keycloak;

use Firebase\JWT\JWT;
use Throwable;

/**
 * OIDC Back-Channel Logout 1.0 token validation (contract §4.5, the full
 * list): RS256 signature against the realm JWKS, `iss` matches the
 * configured realm, `aud` contains this client's own id, `iat` is fresh,
 * `events` carries the back-channel-logout event key, `sid` or `sub` is
 * present, and `nonce` is absent (its presence would mean an ID token was
 * substituted for a logout token — the substitution attack this whole
 * check list exists to close).
 *
 * Every structural check runs and every failure is named, not
 * short-circuited on the first one — the endpoint answers `400` with the
 * full reason list, never a bare "invalid_request" that hides which of the
 * six conditions actually failed.
 */
final class LogoutTokenValidator
{
    public function __construct(private readonly KeycloakDiscovery $discovery) {}

    /**
     * @return array{ok:bool, failed:list<string>, claims:array<string,mixed>}
     */
    public function validate(string $logoutToken): array
    {
        if ($logoutToken === '') {
            return ['ok' => false, 'failed' => ['token_missing'], 'claims' => []];
        }

        try {
            $keys = $this->discovery->jwks();
        } catch (Throwable) {
            // Our own infrastructure could not be reached — not a statement
            // about this particular token. Surfaced by the controller as a
            // distinct failure from "token is bad" (§8 point 2 territory,
            // not one of this slice's eight points, but worth not
            // conflating with a genuinely malformed logout token).
            return ['ok' => false, 'failed' => ['jwks_unavailable'], 'claims' => []];
        }

        $previousLeeway = JWT::$leeway;
        JWT::$leeway = (int) config('keycloak.leeway', 0);

        try {
            $decoded = JWT::decode($logoutToken, $keys);
        } catch (Throwable) {
            // Garbage, wrong signature, unknown `kid` — none of these are a
            // logout token this realm issued.
            return ['ok' => false, 'failed' => ['token_invalid'], 'claims' => []];
        } finally {
            JWT::$leeway = $previousLeeway;
        }

        $claims = json_decode((string) json_encode($decoded), true);
        $claims = is_array($claims) ? $claims : [];

        $failed = [];

        $expectedIssuer = (string) config('keycloak.issuer');
        if ($expectedIssuer === '' || ($claims['iss'] ?? null) !== $expectedIssuer) {
            $failed[] = 'iss';
        }

        $expectedAudience = (string) config('keycloak.audience');
        $audiences = $this->normalizeAudience($claims['aud'] ?? null);
        if (! in_array($expectedAudience, $audiences, true)) {
            $failed[] = 'aud';
        }

        $events = $claims['events'] ?? null;
        if (! is_array($events) || ! array_key_exists('http://schemas.openid.net/event/backchannel-logout', $events)) {
            $failed[] = 'events';
        }

        // Point 2 of the consumer note starts here: a logout token WITHOUT
        // `sid` (logout by `sub` alone) is explicitly permitted by OIDC BCL
        // 1.0 — this check only rejects a token that carries NEITHER.
        if (! isset($claims['sid']) && ! isset($claims['sub'])) {
            $failed[] = 'sid_or_sub';
        }

        // `nonce` is forbidden on a logout token — its presence is the
        // signature of an ID token substituted in its place.
        if (array_key_exists('nonce', $claims)) {
            $failed[] = 'no_nonce';
        }

        $maxAge = (int) config('keycloak.logout_token_max_age_seconds', 300);
        $leeway = (int) config('keycloak.leeway', 0);
        $iat = $claims['iat'] ?? null;
        if (! is_int($iat) || $iat < (time() - $maxAge) || $iat > (time() + $leeway)) {
            $failed[] = 'iat';
        }

        return ['ok' => $failed === [], 'failed' => $failed, 'claims' => $claims];
    }

    /**
     * @return list<string>
     */
    private function normalizeAudience(mixed $aud): array
    {
        if ($aud === null) {
            return [];
        }
        if (is_array($aud)) {
            return array_values(array_map('strval', $aud));
        }

        return [(string) $aud];
    }
}
