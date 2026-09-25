<?php

namespace Tests\Unit\Services\Keycloak;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use RuntimeException;

/**
 * An RSA key pair generated once per process and the helpers to sign JWTs
 * with it, so validator tests can hand a mocked `KeycloakDiscovery` a real
 * key set without any identity provider or network call.
 */
trait SignsTestTokens
{
    private const KID = 'unit-kid';

    private const ISSUER = 'https://kc.example.test/realms/unit';

    private const AUDIENCE = 'psychon-api';

    /** @var array{private: string, public: string, n: string, e: string}|null */
    private static ?array $keyPair = null;

    /** @return array<string, Key> */
    private function keySet(): array
    {
        return [self::KID => new Key(self::keyPair()['public'], 'RS256')];
    }

    /**
     * @param  array<string, mixed>  $claims  merged over a valid payload; a `null` value removes the claim
     */
    private function sign(array $claims = [], ?string $kid = self::KID): string
    {
        $payload = array_filter(array_replace([
            'iss' => self::ISSUER,
            'aud' => [self::AUDIENCE, 'account'],
            'sub' => 'sub-1',
            'iat' => time(),
            'exp' => time() + 300,
        ], $claims), fn (mixed $value): bool => $value !== null);

        return JWT::encode($payload, self::keyPair()['private'], 'RS256', $kid);
    }

    /** @return array{private: string, public: string, n: string, e: string} */
    private static function keyPair(): array
    {
        if (self::$keyPair !== null) {
            return self::$keyPair;
        }

        $resource = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);

        if ($resource === false) {
            throw new RuntimeException('Could not generate a test RSA key pair.');
        }

        openssl_pkey_export($resource, $private);
        $details = openssl_pkey_get_details($resource);

        return self::$keyPair = [
            'private' => $private,
            'public' => $details['key'],
            'n' => JWT::urlsafeB64Encode($details['rsa']['n']),
            'e' => JWT::urlsafeB64Encode($details['rsa']['e']),
        ];
    }
}
