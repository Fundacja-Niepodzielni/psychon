<?php

namespace App\Services\Keycloak;

use Firebase\JWT\JWK;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * OIDC discovery + JWKS fetch, shared by every Keycloak token consumer in
 * this application (access tokens via `TokenValidator`, logout tokens via
 * `LogoutTokenValidator`). Extracted out of `TokenValidator` so the
 * two-address lesson — discovery is fetched from the internal address and
 * its `issuer` is asserted against the public one before anything is
 * trusted — is written, and can go wrong, in exactly one place.
 */
class KeycloakDiscovery
{
    /**
     * @return array<string,Key>
     */
    public function jwks(): array
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
    public function discovery(): array
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
            // Only ever true for a local run against the throwaway Caddy CA —
            // never in production, and this flag is never set true by this
            // file, only by environment.
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
}
