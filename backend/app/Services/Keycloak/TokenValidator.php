<?php

namespace App\Services\Keycloak;

use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\SignatureInvalidException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use UnexpectedValueException;

/**
 * Validates a Keycloak access token against the realm's own JWKS — signature,
 * issuer, audience, expiry (`ZALACZNIK-OD-022` criterion §3). JWKS is taken
 * from OIDC discovery every time it is (re-)fetched, never hardcoded
 * (criterion §5).
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
    /**
     * @throws InvalidKeycloakTokenException the token itself is not acceptable
     * @throws RuntimeException the IdP/config is not in a state we can validate against
     */
    public function validate(?string $token): KeycloakPrincipal
    {
        if ($token === null || $token === '') {
            throw new InvalidKeycloakTokenException('missing_token', 'No bearer token was presented.');
        }

        $keys = $this->jwks();

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

        return new KeycloakPrincipal($sub, $roles);
    }

    /**
     * @return array<string,Key>
     */
    private function jwks(): array
    {
        $cacheKey = 'keycloak:jwks:'.md5((string) config('keycloak.discovery_base'));
        $ttl = (int) config('keycloak.jwks_cache_ttl', 300);

        $jwks = Cache::remember($cacheKey, $ttl, function (): array {
            $discovery = $this->discovery();

            $jwksUri = $discovery['jwks_uri'] ?? null;
            if (! is_string($jwksUri) || $jwksUri === '') {
                throw new RuntimeException('Discovery document has no "jwks_uri".');
            }

            // Two-address lesson again: `jwks_uri` in the discovery document
            // is rendered with the PUBLIC address (`KC_HOSTNAME` is fixed),
            // but this server can only reach the IdP at `discovery_base`
            // (internal address). Rewrite the origin, keep the path Keycloak
            // gave us — never hardcode the path.
            $jwksUri = $this->rewriteToDiscoveryBaseOrigin($jwksUri);

            $response = $this->httpClient()->get($jwksUri);
            if (! $response->successful()) {
                throw new RuntimeException("Could not fetch JWKS from {$jwksUri}: HTTP {$response->status()}.");
            }

            return $response->json();
        });

        return JWK::parseKeySet($jwks);
    }

    /**
     * Fetches OIDC discovery from the INTERNAL address and asserts its
     * `issuer` equals the configured PUBLIC address (two-address lesson).
     * A mismatch is a configuration defect, not a token problem — it does
     * not produce a 401, it surfaces as a 500 so it is never mistaken for
     * "this particular token is bad".
     *
     * @return array<string,mixed>
     */
    private function discovery(): array
    {
        $base = rtrim((string) config('keycloak.discovery_base'), '/');
        if ($base === '') {
            throw new RuntimeException('keycloak.discovery_base (KEYCLOAK_DISCOVERY_BASE / KEYCLOAK_ISSUER) is not configured.');
        }

        $response = $this->httpClient()->get($base.'/.well-known/openid-configuration');
        if (! $response->successful()) {
            throw new RuntimeException("Could not fetch OIDC discovery from {$base}: HTTP {$response->status()}.");
        }

        $discovery = $response->json();

        $expectedIssuer = (string) config('keycloak.issuer');
        $discoveredIssuer = $discovery['issuer'] ?? null;
        if ($expectedIssuer === '' || $discoveredIssuer !== $expectedIssuer) {
            throw new RuntimeException(sprintf(
                'Discovery issuer "%s" (fetched from %s) does not match the configured public issuer "%s" — refusing to trust this realm.',
                $discoveredIssuer ?? '(none)',
                $base,
                $expectedIssuer,
            ));
        }

        return $discovery;
    }

    private function httpClient()
    {
        $client = Http::timeout(10);

        $caFile = config('keycloak.ca_file');
        if (is_string($caFile) && $caFile !== '') {
            $client = $client->withOptions(['verify' => $caFile]);
        } elseif (config('keycloak.insecure_tls') === true) {
            // Recipe §8 gap 5 / criterion §5: only ever true for a local run
            // against the throwaway Caddy CA — never in production, and this
            // flag is never set true by this file, only by environment.
            $client = $client->withoutVerifying();
        }

        return $client;
    }

    /**
     * Replaces the scheme+host+port of `$publicUrl` with the origin of
     * `keycloak.discovery_base`, keeping path/query untouched. Used only for
     * endpoints this server must call itself (`jwks_uri`) — browser-facing
     * endpoints are never rewritten.
     */
    private function rewriteToDiscoveryBaseOrigin(string $publicUrl): string
    {
        $base = (string) config('keycloak.discovery_base');
        $baseParts = parse_url($base);
        $urlParts = parse_url($publicUrl);

        if (! is_array($baseParts) || ! is_array($urlParts) || ! isset($baseParts['scheme'], $baseParts['host'])) {
            return $publicUrl;
        }

        $origin = $baseParts['scheme'].'://'.$baseParts['host'].(isset($baseParts['port']) ? ':'.$baseParts['port'] : '');
        $rest = ($urlParts['path'] ?? '').(isset($urlParts['query']) ? '?'.$urlParts['query'] : '');

        return $origin.$rest;
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
