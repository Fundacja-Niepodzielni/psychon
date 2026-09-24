<?php

namespace Tests\Unit\Services\Keycloak;

use App\Services\Keycloak\InvalidKeycloakTokenException;
use App\Services\Keycloak\KeycloakDiscovery;
use App\Services\Keycloak\TokenValidator;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\TestCase;
use Mockery;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Boots the application for `config()` only; `KeycloakDiscovery` is mocked,
 * so no HTTP call and no database connection is made.
 */
class TokenValidatorTest extends TestCase
{
    use SignsTestTokens;

    private KeycloakDiscovery&MockInterface $discovery;

    private TokenValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();

        config(['keycloak.issuer' => self::ISSUER, 'keycloak.audience' => self::AUDIENCE, 'keycloak.leeway' => 0]);
        $this->discovery = Mockery::mock(KeycloakDiscovery::class);
        $this->validator = new TokenValidator($this->discovery);
    }

    public function test_a_valid_token_yields_the_principal_from_its_claims(): void
    {
        $this->discovery->shouldReceive('jwks')->once()->withNoArgs()->andReturn($this->keySet());

        $principal = $this->validator->validate($this->sign([
            'sub' => 'sub-7',
            'sid' => 'sid-7',
            'realm_access' => ['roles' => ['prowadzacy', 'wymaga-2fa']],
        ]));

        $this->assertSame('sub-7', $principal->sub);
        $this->assertSame(['prowadzacy', 'wymaga-2fa'], $principal->roles);
        $this->assertSame('sid-7', $principal->sid);
    }

    public function test_absent_roles_sid_and_a_string_audience_are_valid(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());

        $principal = $this->validator->validate($this->sign(['aud' => self::AUDIENCE]));

        $this->assertSame([], $principal->roles);
        $this->assertNull($principal->sid);
    }

    #[DataProvider('missingTokens')]
    public function test_a_missing_token_is_rejected_before_any_key_lookup(?string $token): void
    {
        $this->discovery->shouldReceive('jwks')->never();

        $this->assertRejected('missing_token', fn () => $this->validator->validate($token));
    }

    /** @return array<string, array{?string}> */
    public static function missingTokens(): array
    {
        return ['null' => [null], 'empty' => ['']];
    }

    /** @param  array<string, mixed>  $claims */
    #[DataProvider('rejectedClaims')]
    public function test_a_token_with_bad_claims_is_rejected(array $claims, string $reason): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());

        $this->assertRejected($reason, fn () => $this->validator->validate($this->sign($claims)));
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function rejectedClaims(): array
    {
        return [
            'expired' => [['exp' => time() - 10], 'expired'],
            'foreign issuer' => [['iss' => 'https://other.example.test/realms/unit'], 'issuer'],
            'no issuer' => [['iss' => null], 'issuer'],
            'foreign audience' => [['aud' => ['account']], 'audience'],
            'no audience' => [['aud' => null], 'audience'],
            'no subject' => [['sub' => null], 'signature'],
        ];
    }

    public function test_a_tampered_or_malformed_token_is_rejected_as_signature(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());
        $segments = explode('.', $this->sign());
        $segments[1] = JWT::urlsafeB64Encode('{"sub":"someone-else"}');

        $this->assertRejected('signature', fn () => $this->validator->validate(implode('.', $segments)));
        $this->assertRejected('signature', fn () => $this->validator->validate('not-a-jwt'));
    }

    public function test_an_unknown_kid_triggers_exactly_one_forced_refresh(): void
    {
        $this->discovery->shouldReceive('jwks')->once()->withNoArgs()->andReturn($this->rotatedKeySet());
        $this->discovery->shouldReceive('jwks')->once()->with(true)->andReturn($this->keySet());

        $this->assertSame('sub-1', $this->validator->validate($this->sign())->sub);
    }

    public function test_a_kid_still_unknown_after_refresh_is_rejected(): void
    {
        $this->discovery->shouldReceive('jwks')->once()->withNoArgs()->andReturn($this->rotatedKeySet());
        $this->discovery->shouldReceive('jwks')->once()->with(true)->andReturn($this->rotatedKeySet());

        $this->assertRejected('signature', fn () => $this->validator->validate($this->sign()));
    }

    public function test_a_token_without_kid_is_rejected_without_refresh(): void
    {
        $this->discovery->shouldReceive('jwks')->once()->withNoArgs()->andReturn($this->keySet());
        $this->discovery->shouldReceive('jwks')->with(true)->never();

        $this->assertRejected('signature', fn () => $this->validator->validate($this->sign([], null)));
    }

    public function test_the_configured_leeway_applies_and_the_global_one_is_restored(): void
    {
        $this->discovery->shouldReceive('jwks')->andReturn($this->keySet());
        config(['keycloak.leeway' => 30]);
        JWT::$leeway = 7;

        $this->assertSame('sub-1', $this->validator->validate($this->sign(['exp' => time() - 10]))->sub);
        $this->assertSame(7, JWT::$leeway);

        config(['keycloak.leeway' => 0]);
        $this->assertRejected('expired', fn () => $this->validator->validate($this->sign(['exp' => time() - 10])));
        $this->assertSame(7, JWT::$leeway);

        JWT::$leeway = 0;
    }

    /** @return array<string, Key> */
    private function rotatedKeySet(): array
    {
        return ['rotated-kid' => $this->keySet()[self::KID]];
    }

    private function assertRejected(string $reason, callable $validate): void
    {
        try {
            $validate();
        } catch (InvalidKeycloakTokenException $e) {
            $this->assertSame($reason, $e->reason);

            return;
        }

        $this->fail("Expected the token to be rejected with reason \"{$reason}\".");
    }
}
