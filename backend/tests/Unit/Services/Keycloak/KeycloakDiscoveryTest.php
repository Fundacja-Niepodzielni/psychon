<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\KeycloakDiscovery;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Boots the application for `config()`, the array cache store and
 * `Http::fake()`; no request leaves the process and no database connection
 * is opened.
 */
class KeycloakDiscoveryTest extends TestCase
{
    use SignsTestTokens;

    private const INTERNAL = 'http://keycloak.internal:8080/realms/unit';

    private const CERTS_PATH = '/realms/unit/protocol/openid-connect/certs';

    protected function setUp(): void
    {
        parent::setUp();

        config(['keycloak.issuer' => self::ISSUER, 'keycloak.discovery_base' => self::INTERNAL.'/']);
    }

    public function test_discovery_is_fetched_from_the_internal_address(): void
    {
        $this->fakeRealm();

        $document = (new KeycloakDiscovery)->discovery();

        $this->assertSame(self::ISSUER, $document['issuer']);
        Http::assertSent(fn (Request $r): bool => $r->url() === self::INTERNAL.'/.well-known/openid-configuration');
    }

    public function test_discovery_refuses_an_unconfigured_base(): void
    {
        config(['keycloak.discovery_base' => '']);
        Http::fake();

        $this->expectException(RuntimeException::class);
        (new KeycloakDiscovery)->discovery();
    }

    public function test_discovery_refuses_a_failed_response(): void
    {
        Http::fake(['*' => Http::response([], 503)]);

        $this->expectExceptionMessage('HTTP 503');
        (new KeycloakDiscovery)->discovery();
    }

    public function test_discovery_refuses_an_issuer_other_than_the_configured_one(): void
    {
        $this->fakeRealm(['issuer' => 'https://evil.example.test/realms/unit']);

        $this->expectExceptionMessage('does not match the configured public issuer');
        (new KeycloakDiscovery)->discovery();
    }

    public function test_discovery_refuses_when_no_public_issuer_is_configured(): void
    {
        config(['keycloak.issuer' => '']);
        $this->fakeRealm(['issuer' => '']);

        $this->expectException(RuntimeException::class);
        (new KeycloakDiscovery)->discovery();
    }

    public function test_jwks_is_fetched_through_the_internal_origin_and_parsed(): void
    {
        $this->fakeRealm();

        $keys = (new KeycloakDiscovery)->jwks();

        $this->assertSame([self::KID], array_keys($keys));
        $this->assertInstanceOf(Key::class, $keys[self::KID]);
        Http::assertSent(fn (Request $r): bool => $r->url() === 'http://keycloak.internal:8080'.self::CERTS_PATH);
        Http::assertNotSent(fn (Request $r): bool => str_starts_with($r->url(), 'https://kc.example.test'));
    }

    public function test_jwks_is_cached_between_calls(): void
    {
        $this->fakeRealm();

        (new KeycloakDiscovery)->jwks();
        (new KeycloakDiscovery)->jwks();

        Http::assertSentCount(2);
    }

    public function test_a_forced_refresh_refetches_at_most_once_per_throttle_window(): void
    {
        config(['keycloak.jwks_kid_miss_throttle_seconds' => 60]);
        $this->fakeRealm();
        $discovery = new KeycloakDiscovery;

        $discovery->jwks();
        $discovery->jwks(forceRefresh: true);
        $discovery->jwks(forceRefresh: true);

        Http::assertSentCount(4);
    }

    public function test_jwks_refuses_a_discovery_document_without_jwks_uri(): void
    {
        $this->fakeRealm(['jwks_uri' => null]);

        $this->expectExceptionMessage('Discovery document has no "jwks_uri".');
        (new KeycloakDiscovery)->jwks();
    }

    public function test_jwks_refuses_a_failed_key_download(): void
    {
        $this->fakeRealm([], 500);

        $this->expectExceptionMessage('Could not fetch JWKS');
        (new KeycloakDiscovery)->jwks();
    }

    /** @param  array<string, mixed>  $document */
    private function fakeRealm(array $document = [], int $jwksStatus = 200): void
    {
        $key = self::keyPair();

        Http::fake([
            self::INTERNAL.'/.well-known/openid-configuration' => Http::response(array_replace([
                'issuer' => self::ISSUER,
                'jwks_uri' => 'https://kc.example.test'.self::CERTS_PATH,
            ], $document)),
            'http://keycloak.internal:8080'.self::CERTS_PATH => Http::response(['keys' => [[
                'kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => self::KID, 'n' => $key['n'], 'e' => $key['e'],
            ]]], $jwksStatus),
        ]);
    }
}
