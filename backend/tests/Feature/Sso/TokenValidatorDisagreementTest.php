<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * The disagreement leg: the local `users` row says one role, the token says
 * another — the token wins. `/api/v1/sso/whoami` must never consult the
 * local database at all, so a conflicting local row is not merely
 * outvoted — it is never even read.
 */
class TokenValidatorDisagreementTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_token_wins_over_a_conflicting_local_role(): void
    {
        $email = 'test-kandydat@niepodzielni.test';
        $sub = 'sub-test-kandydat';

        // A local row with a high-privilege role the token does not carry —
        // the same shape as the live fixture this criterion was written
        // from (a candidate with no ecosystem role in the realm, but with a
        // stale/conflicting local row).
        User::factory()->create([
            'email' => $email,
            'role' => 'admin',
        ]);

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint([
            'sub' => $sub,
            'email' => $email,
            'realm_access' => ['roles' => []],
        ]);

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/sso/whoami');

        $response->assertStatus(200)
            ->assertJsonPath('sub', $sub)
            ->assertJsonPath('roles', []);

        $this->assertNotContains(
            'admin',
            $response->json('roles'),
            'The local users.role value must never leak into the token-derived response.',
        );
    }
}
