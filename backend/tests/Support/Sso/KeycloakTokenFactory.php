<?php

namespace Tests\Support\Sso;

use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Mints access tokens shaped like the ones a real identity provider would
 * issue, signed by an RSA key pair generated fresh for the lifetime of a
 * single test, and fakes the two HTTP calls the validator makes to reach
 * that key (OIDC discovery + JWKS). No real identity provider, no fixed
 * secret, no real host name — the suite runs on a machine that has never
 * heard of Keycloak.
 */
final class KeycloakTokenFactory
{
    public const ISSUER = 'https://kc.test/realms/niepodzielni-test';

    public const KID = 'test-kid';

    /** The one event key OIDC Back-Channel Logout 1.0 requires in a logout token. */
    public const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

    private string $privateKeyPem;

    /** @var array<string,string> */
    private array $jwk;

    public function __construct()
    {
        $resource = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);

        if ($resource === false) {
            throw new \RuntimeException('Could not generate a test RSA key pair: '.openssl_error_string());
        }

        $privateKeyPem = null;
        openssl_pkey_export($resource, $privateKeyPem);
        $this->privateKeyPem = $privateKeyPem;
        $details = openssl_pkey_get_details($resource);

        $this->jwk = [
            'kty' => 'RSA',
            'alg' => 'RS256',
            'use' => 'sig',
            'kid' => self::KID,
            'n' => JWT::urlsafeB64Encode($details['rsa']['n']),
            'e' => JWT::urlsafeB64Encode($details['rsa']['e']),
        ];
    }

    /**
     * Points `keycloak.issuer` / `keycloak.discovery_base` at this instance's
     * made-up realm and fakes both HTTP calls `TokenValidator` makes to
     * resolve it (discovery document, then JWKS) with responses backed by
     * this instance's own key. No network call this validator makes ever
     * leaves the test process.
     */
    public function installAsRealm(): self
    {
        Config::set('keycloak.issuer', self::ISSUER);
        Config::set('keycloak.discovery_base', self::ISSUER);

        Http::fake([
            self::ISSUER.'/.well-known/openid-configuration' => Http::response([
                'issuer' => self::ISSUER,
                'jwks_uri' => self::ISSUER.'/protocol/openid-connect/certs',
            ]),
            self::ISSUER.'/protocol/openid-connect/certs' => Http::response([
                'keys' => [$this->jwk],
            ]),
        ]);

        return $this;
    }

    /**
     * @param  array<string,mixed>  $claims  overrides merged over a valid default payload
     */
    public function mint(array $claims = []): string
    {
        $now = time();

        $payload = array_replace([
            'iss' => self::ISSUER,
            'aud' => ['psychon-api', 'account'],
            'azp' => 'psychon-api',
            'sub' => (string) Str::uuid(),
            'iat' => $now,
            'exp' => $now + 300,
            'realm_access' => ['roles' => []],
        ], $claims);

        return JWT::encode($payload, $this->privateKeyPem, 'RS256', self::KID);
    }

    /**
     * A logout token: the same signing key and issuer as {@see mint()}'s
     * access tokens (so the same {@see installAsRealm()} realm validates
     * both), but shaped for OIDC Back-Channel Logout 1.0 — it carries the
     * `events` claim the spec requires and, unlike an access token, has no
     * `exp` the logout-token validator would even look at.
     *
     * @param  array<string,mixed>  $claims  overrides merged over a minimal valid logout-token payload
     */
    public function mintLogoutToken(array $claims = []): string
    {
        return $this->mint(array_replace([
            'events' => [self::BACKCHANNEL_LOGOUT_EVENT => (object) []],
        ], $claims));
    }

    /**
     * Same claims as {@see mint()} but with the signature segment tampered
     * (one character flipped, length and base64url alphabet preserved) —
     * the "wrong signature" negative leg, built from a token this same key
     * pair produced rather than a hand-written fixture string.
     */
    public function mintWithTamperedSignature(array $claims = []): string
    {
        $token = $this->mint($claims);
        $segments = explode('.', $token);
        $signature = $segments[2];

        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        $middle = intdiv(strlen($signature), 2);
        $current = $signature[$middle];
        $replacement = $current === $alphabet[0] ? $alphabet[1] : $alphabet[0];
        $signature[$middle] = $replacement;

        $segments[2] = $signature;

        return implode('.', $segments);
    }
}
