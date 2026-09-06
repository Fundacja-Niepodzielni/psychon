<?php

namespace App\Services\Keycloak;

use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\SignatureInvalidException;
use RuntimeException;
use UnexpectedValueException;

/**
 * Validates a Keycloak access token against the realm's own JWKS — signature,
 * issuer, audience, expiry (the identity contract). JWKS is taken
 * from OIDC discovery every time it is (re-)fetched, never hardcoded
 * (criterion §5), via `KeycloakDiscovery` (shared with `LogoutTokenValidator`).
 *
 * The two-address lesson (recipe §5): discovery is fetched from
 * `keycloak.discovery_base` (reachable from THIS server — internal address
 * once this app joins the IdP's compose network), but the `issuer` inside
 * that discovery document, and the `iss` claim of every token, are compared
 * against `keycloak.issuer` (the PUBLIC address a browser would use). A
 * mismatch aborts — it means the two addresses have not been configured
 * correctly, and letting it through would silently accept tokens whose
 * origin we never actually checked.
 */
class TokenValidator
{
    public function __construct(private readonly KeycloakDiscovery $discovery) {}

    /**
     * @throws InvalidKeycloakTokenException the token itself is not acceptable
     * @throws RuntimeException the IdP/config is not in a state we can validate against
     */
    public function validate(?string $token): KeycloakPrincipal
    {
        if ($token === null || $token === '') {
            throw new InvalidKeycloakTokenException('missing_token', 'No bearer token was presented.');
        }

        $keys = $this->discovery->jwks();

        $previousLeeway = JWT::$leeway;
        JWT::$leeway = (int) config('keycloak.leeway', 0);

        try {
            $payload = JWT::decode($token, $keys);
        } catch (ExpiredException $e) {
            throw new InvalidKeycloakTokenException('expired', 'The token has expired.', $e);
        } catch (SignatureInvalidException $e) {
            throw new InvalidKeycloakTokenException('signature', 'The token signature does not verify against the realm JWKS.', $e);
        } catch (UnexpectedValueException|\DomainException|\InvalidArgumentException $e) {
            // Malformed token, unknown `kid`, wrong algorithm, etc. — all of
            // these mean "not a token we can trust", so they collapse to the
            // same reason as a bad signature rather than leaking library
            // internals as separate outcomes.
            throw new InvalidKeycloakTokenException('signature', 'The token could not be verified: '.$e->getMessage(), $e);
        } finally {
            JWT::$leeway = $previousLeeway;
        }

        $expectedIssuer = (string) config('keycloak.issuer');
        if (! isset($payload->iss) || $payload->iss !== $expectedIssuer) {
            throw new InvalidKeycloakTokenException(
                'issuer',
                sprintf('Token issuer "%s" does not match the configured realm "%s".', $payload->iss ?? '(none)', $expectedIssuer),
            );
        }

        $expectedAudience = (string) config('keycloak.audience');
        $audiences = $this->normalizeAudience($payload->aud ?? null);
        if (! in_array($expectedAudience, $audiences, true)) {
            throw new InvalidKeycloakTokenException(
                'audience',
                sprintf('Token audience [%s] does not include "%s".', implode(', ', $audiences), $expectedAudience),
            );
        }

        $sub = (string) ($payload->sub ?? '');
        if ($sub === '') {
            throw new InvalidKeycloakTokenException('signature', 'Token has no "sub" claim.');
        }

        // Contract §2b / criterion §3: roles come from `realm_access.roles`
        // ONLY — never the ID token, never userinfo, never a group name, and
        // (structurally, by never touching the `users` table here) never the
        // local database. An absent or empty list is a valid state.
        $roles = [];
        if (isset($payload->realm_access) && isset($payload->realm_access->roles)) {
            $roles = array_values(array_map('strval', (array) $payload->realm_access->roles));
        }

        // `sid` is present on every token minted through `psychon-api`'s own
        // authorization-code flow (realm attribute
        // `backchannel.logout.session.required=true`); absent on tokens that
        // never went through a browser session (e.g. `client_credentials`).
        // Consumed by the back-channel logout read path — see
        // `AuthenticateKeycloakToken` — to decide whether this bearer token
        // is bound to a session that a logout event can invalidate at all.
        $sid = isset($payload->sid) ? (string) $payload->sid : null;

        return new KeycloakPrincipal($sub, $roles, $sid);
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
