<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\KeycloakDiscovery;
use App\Services\Keycloak\LogoutTokenValidator;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\TestCase;
use Mockery;
use Mockery\MockInterface;
use RuntimeException;

/**
 * Boots the application for `config()` only; `KeycloakDiscovery` is mocked,
 * so no HTTP call and no database connection is made.
 */
class LogoutTokenValidatorTest extends TestCase
{
    use SignsTestTokens;

    private const EVENT = 'http://schemas.openid.net/event/backchannel-logout';

    private KeycloakDiscovery&MockInterface $discovery;

    private LogoutTokenValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'keycloak.issuer' => self::ISSUER,
            'keycloak.audience' => self::AUDIENCE,
            'keycloak.leeway' => 0,
            'keycloak.logout_token_max_age_seconds' => 300,
        ]);
        $this->discovery = Mockery::mock(KeycloakDiscovery::class);
        $this->validator = new LogoutTokenValidator($this->discovery);
    }

    public function test_a_well_formed_logout_token_is_accepted_with_its_claims(): void
    {
        $this->discovery->shouldReceive('jwks')->once()->andReturn($this->keySet());

        $result = $this->validator->validate($this->logoutToken(['sid' => 'sid-1']));

        $this->assertTrue($result['ok']);
        $this->assertSame([], $result['failed']);
        $this->assertSame('sid-1', $result['claims']['sid']);
    }

    public function test_a_logout_by_subject_alone_is_accepted(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());

        $this->assertTrue($this->validator->validate($this->logoutToken())['ok']);
    }

    public function test_an_empty_token_is_rejected_before_any_key_lookup(): void
    {
        $this->discovery->shouldReceive('jwks')->never();

        $this->assertSame(
            ['ok' => false, 'failed' => ['token_missing'], 'claims' => []],
            $this->validator->validate(''),
        );
    }

    public function test_an_unreachable_key_set_is_reported_separately(): void
    {
        $this->discovery->shouldReceive('jwks')->andThrow(new RuntimeException('HTTP 503'));

        $this->assertSame(['jwks_unavailable'], $this->validator->validate($this->logoutToken())['failed']);
    }

    public function test_an_unverifiable_token_is_rejected_as_invalid(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());

        $this->assertSame(['token_invalid'], $this->validator->validate('not-a-jwt')['failed']);
        $this->assertSame(['token_invalid'], $this->validator->validate($this->logoutToken([], 'other-kid'))['failed']);
    }

    public function test_every_failed_structural_check_is_named(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());

        $result = $this->validator->validate($this->sign([
            'iss' => 'https://other.example.test/realms/unit',
            'aud' => 'account',
            'sub' => null,
            'nonce' => 'n-1',
            'iat' => time() - 301,
        ]));

        $this->assertFalse($result['ok']);
        $this->assertSame(['iss', 'aud', 'events', 'sid_or_sub', 'no_nonce', 'iat'], $result['failed']);
    }

    /**
     * Why this case exists: the shared token factory issues tokens with an `iat`
     * a minute in the past (so a wall-clock step back cannot make them fail),
     * which means nothing else in the suite presents a token issued in the
     * future. This is the only coverage of rejecting such a token. The JWT
     * library refuses it while decoding, so the outcome is `token_invalid` and
     * not the `iat` entry of the structural list. The library clock is pinned
     * to the instant the token is minted so a wall-clock step cannot change it.
     */
    public function test_a_logout_token_issued_one_second_in_the_future_is_rejected_at_zero_leeway(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());
        config(['keycloak.leeway' => 0]);

        $now = time();
        $previousTimestamp = JWT::$timestamp;
        JWT::$timestamp = $now;

        try {
            $result = $this->validator->validate($this->logoutToken(['iat' => $now + 1, 'exp' => $now + 300]));
        } finally {
            JWT::$timestamp = $previousTimestamp;
        }

        $this->assertSame(['ok' => false, 'failed' => ['token_invalid'], 'claims' => []], $result);
    }

    public function test_an_unconfigured_issuer_never_matches(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());
        config(['keycloak.issuer' => '']);

        $this->assertSame(['iss'], $this->validator->validate($this->logoutToken(['iss' => '']))['failed']);
    }

    public function test_the_global_leeway_is_restored(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());
        config(['keycloak.leeway' => 30]);
        JWT::$leeway = 7;

        $this->validator->validate($this->logoutToken());
        $this->validator->validate('not-a-jwt');

        $this->assertSame(7, JWT::$leeway);
        JWT::$leeway = 0;
    }

    /** @param  array<string, mixed>  $claims */
    private function logoutToken(array $claims = [], string $kid = self::KID): string
    {
        return $this->sign(array_replace(['events' => [self::EVENT => (object) []]], $claims), $kid);
    }
}
