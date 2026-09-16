<?php

namespace Tests\Feature\Sso;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Group;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Criterion §B8e: an unknown `kid` (as if a key had rotated at the IdP)
 * triggers exactly one JWKS refresh; a second unknown `kid` inside the same
 * 60s window costs zero additional HTTP calls to the IdP and still fails
 * with 401 — this endpoint never "just keeps trying" for a storm of tokens
 * carrying made-up `kid`s.
 *
 * No database trait: `/sso/whoami` never touches `users` (see
 * `TokenValidatorNegativeCasesTest`'s own comment for why that class — and
 * this one — sit in `wspolna-baza`).
 */
#[Group('wspolna-baza')]
class JwksKidRefreshTest extends TestCase
{
    private const ROUTE = '/api/v1/sso/whoami';

    protected function setUp(): void
    {
        parent::setUp();

        // A stale JWKS cache entry or a still-open throttle window left
        // over from another test in the same process would silently change
        // which of the two calls below is "the cold one" — start from a
        // known-empty cache every time.
        Cache::flush();
    }

    /**
     * @return int number of HTTP calls this test actually sent to the
     *             realm's certs (JWKS) endpoint so far
     */
    private function jwksFetchCount(): int
    {
        return collect(Http::recorded())
            ->filter(fn (array $pair): bool => str_contains((string) $pair[0]->url(), '/protocol/openid-connect/certs'))
            ->count();
    }

    public function test_an_unknown_kid_forces_exactly_one_refresh_within_60_seconds(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();

        $first = $realm->mintWithUnknownKid('rotated-kid-1');

        $this->withHeader('Authorization', 'Bearer '.$first)
            ->getJson(self::ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.reason.cause', 'signature');

        // Cold cache (this test's first call): the plain "fetch keys" path
        // already hits the certs endpoint once before decode even runs,
        // then the unknown-`kid` retry forces a second fetch — both counted
        // here, since what matters is "how many times did we call the IdP
        // for this one request", not which call site made each one.
        $afterFirst = $this->jwksFetchCount();
        $this->assertSame(2, $afterFirst, 'Cold cache fetch + exactly one forced refresh = 2 JWKS fetches.');

        $second = $realm->mintWithUnknownKid('rotated-kid-2');

        $this->withHeader('Authorization', 'Bearer '.$second)
            ->getJson(self::ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.reason.cause', 'signature');

        $this->assertSame(
            $afterFirst,
            $this->jwksFetchCount(),
            'A second unknown kid within the throttle window must not cost another JWKS fetch.',
        );
    }

    /**
     * A `kid` that is simply ABSENT from the token header (never a rotation
     * event) must not spend a network round trip at all — only a present
     * but unrecognised `kid` is worth retrying.
     */
    public function test_a_missing_kid_never_triggers_a_refresh(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();

        // installAsRealm() already primes the cache lazily on first use;
        // force a first, ordinary, successful validation so the JWKS cache
        // is warm before the malformed token below is tried.
        $this->withHeader('Authorization', 'Bearer '.$realm->mint())
            ->getJson(self::ROUTE)
            ->assertStatus(200);

        $afterWarm = $this->jwksFetchCount();

        $this->withHeader('Authorization', 'Bearer '.'not-a-jwt-at-all')
            ->getJson(self::ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.reason.cause', 'signature');

        $this->assertSame(
            $afterWarm,
            $this->jwksFetchCount(),
            'A malformed token must fail on shape alone, never spend a JWKS refresh.',
        );
    }
}
