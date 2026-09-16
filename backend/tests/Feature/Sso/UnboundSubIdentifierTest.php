<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * One refusal out of the `keycloak` guard's several now NAMES itself and
 * hands the caller back the identifier of the account that is missing:
 * a token this application fully trusts, whose `sub` has no local user yet.
 * The person who just signed in can read that identifier off the screen and
 * pass it to an administrator, instead of an indistinguishable "log in to
 * continue".
 *
 * The other refusals must stay indistinguishable, and that is the point of
 * the negative halves below: an untrusted token (bad signature, expired,
 * foreign issuer) and a trusted token whose session ended or whose account
 * is blocked never carry an identifier back — the first because nothing in
 * it is trustworthy, the second because the answer would tell a caller
 * something about somebody else's account.
 *
 * The identifier goes to the holder of that same token and nowhere else:
 * never to a log, in full or hashed.
 */
class UnboundSubIdentifierTest extends TestCase
{
    use RefreshDatabase;

    /** A route behind the `keycloak` guard (`auth:keycloak`), i.e. the resolver under test. */
    private const ME_ROUTE = '/api/v1/me';

    public function test_a_valid_token_with_an_unknown_sub_returns_401_naming_that_sub(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub]);

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_niepowiazane');

        // Equal to the `sub` of the very token that was presented — not
        // merely "some identifier": asserted against the minted value.
        $this->assertSame($sub, $response->json('error.reason.sub'));
    }

    public function test_a_token_with_a_broken_signature_never_carries_the_sub_back(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mintWithTamperedSignature(['sub' => $sub]);

        $this->assertRefusedWithoutIdentifier($token, $sub);
    }

    public function test_an_expired_token_never_carries_the_sub_back(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub, 'iat' => time() - 7200, 'exp' => time() - 3600]);

        $this->assertRefusedWithoutIdentifier($token, $sub);
    }

    public function test_a_token_from_a_foreign_issuer_never_carries_the_sub_back(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub, 'iss' => 'https://kc.obcy.test/realms/obcy']);

        $this->assertRefusedWithoutIdentifier($token, $sub);
    }

    /**
     * Negative control for the session that Konta Niepodzielni already
     * ended (back-channel logout): the token is still cryptographically
     * fine and the local user exists and is active, so ONLY the `sid`
     * marker decides here — and it must decide the old way, with no
     * identifier in the answer.
     */
    public function test_a_backchannel_logged_out_session_never_carries_the_sub_back(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $sid = 'sid-unbound-witness-'.uniqid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'sid' => $sid]);

        $this->postJson('/oidc/backchannel-logout', ['logout_token' => $realm->mintLogoutToken(['sid' => $sid])])
            ->assertStatus(200);

        $this->assertRefusedWithoutIdentifier($token, $sub);
    }

    /**
     * Negative control for an account that exists but is blocked: the
     * refusal stays exactly as indistinguishable as it was, because the
     * caller is not to learn from the answer that this account is there.
     */
    public function test_a_blocked_account_never_carries_the_sub_back(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub, 'status' => 'blocked']);
        $token = $realm->mint(['sub' => $sub]);

        $this->assertRefusedWithoutIdentifier($token, $sub);
    }

    /**
     * 401, the envelope the API had before, and — measured on the RAW body,
     * not only on a JSON path — not one occurrence of the identifier
     * anywhere in the answer.
     */
    private function assertRefusedWithoutIdentifier(string $token, string $sub): void
    {
        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertNull($response->json('error.reason.sub'));
        $this->assertStringNotContainsString($sub, (string) $response->getContent());
    }
}
