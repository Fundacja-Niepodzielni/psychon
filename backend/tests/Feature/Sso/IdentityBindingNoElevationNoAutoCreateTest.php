<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Two guarantees the identity-binding slice must hold, proven negatively
 * (each assertion must be independently breakable, see the guard's own
 * criteria list for how each leg below was falsified and restored):
 *
 *  1. Binding an external identity never raises the stored `users.role` —
 *     the token's `realm_access.roles` decide authorisation for THIS
 *     request only (`TokenRoles`), they never get written back onto the
 *     account row.
 *  2. Binding never creates an account row on its own — every entry point
 *     (`KeycloakGuardResolver::resolve()`, `SsoBindController`) requires a
 *     pre-existing local user (found by `keycloak_sub`, or by an invitation
 *     token already sitting on a row) and refuses otherwise.
 */
class IdentityBindingNoElevationNoAutoCreateTest extends TestCase
{
    use RefreshDatabase;

    private const ME_ROUTE = '/api/v1/me';

    private const BIND_ROUTE = '/api/v1/sso/powiaz';

    /**
     * Positive leg of guarantee 1: an account holding the lowest local role
     * binds against a token whose realm roles map to the highest local
     * role. The bind succeeds (identity attaches), but the stored role is
     * read back unchanged — never promoted to what the token would carry.
     */
    public function test_binding_does_not_raise_the_stored_role_even_when_the_token_carries_a_higher_one(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $user = User::factory()->invited()->role('student')->create([
            'activation_token' => 'tok-'.Str::random(20),
        ]);
        $sub = (string) Str::uuid();

        $token = $realm->mint([
            'sub' => $sub,
            'email' => $user->email,
            'email_verified' => true,
            // Whitelisted realm role for `super_admin` — config('keycloak.roles.super_admin').
            'realm_access' => ['roles' => ['admin-fundacja']],
        ]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::BIND_ROUTE, ['token' => $user->activation_token])
            ->assertStatus(200);

        $stored = User::query()->whereKey($user->id)->first();
        $this->assertSame($sub, $stored->keycloak_sub, 'the bind itself must still have taken effect');
        $this->assertSame('student', $stored->role, 'the token role must never overwrite the stored role');
    }

    /**
     * Negative leg of guarantee 2 (`KeycloakGuardResolver`): a token that
     * validates fully (signature, issuer, freshness) but whose `sub`
     * matches no local user and no invitation was ever issued for it must
     * be refused, and refused WITHOUT silently creating the missing
     * account. Measured on the accounts table itself, not on the response
     * shape alone — a row count is the one thing an implementation cannot
     * fake by choosing different wording.
     */
    public function test_an_unlinked_token_with_no_invitation_is_refused_without_creating_an_account(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $before = User::query()->count();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_niepowiazane');

        $this->assertSame($before, User::query()->count(), 'a refused login must not add a row to the accounts table');
        $this->assertSame(0, User::query()->where('keycloak_sub', $sub)->count(), 'no account may ever be bound to the refused sub');
    }

    /**
     * Negative leg of guarantee 2 (`SsoBindController` / `ApplicationFirstLoginBinder`):
     * an invitation-token value nobody issued binds to no row and creates
     * none — the endpoint fails closed on `invalid_token`, not by minting a
     * fresh account for whoever presents a bearer token.
     *
     * `bindByInvitationToken()` wraps its whole body in `DB::transaction()`,
     * so a bug that creates a row and only afterwards decides to throw would
     * be invisible to a plain "row count after the request" check: the
     * transaction's own rollback erases the row before this test ever reads
     * the table. The query listener below catches the attempted `insert`
     * itself, at the moment it is sent to the database, before any rollback
     * gets a chance to hide it.
     *
     * The listener assertion (`$this->assertSame(0, $attemptedUserInserts`)
     * runs before the row-count assertion
     * (`$this->assertSame($before, User::query()->count()`) and PHPUnit
     * stops at the first failing assertion — so once
     * an attempted insert is observed, the row-count check never executes
     * and covers nothing for that run. Given this ordering, the row-count
     * assertion only earns its place for the one case the listener cannot
     * see at all: a row that ends up in the table without any `insert ...
     * users` query ever passing through this listener on this connection.
     * It does NOT cover "a row created before the transaction opens or
     * after it commits" as a distinct case from what the listener already
     * catches — any such insert would still be an `insert` query sent to
     * the database and would already have tripped the listener assertion
     * first.
     *
     * The listener itself is also not scoped to this request: it counts
     * every `insert ... users` query sent on this connection for the rest
     * of the listener's lifetime (i.e. for the remainder of this test), not
     * only ones caused by the call under test. Nothing here enforces that
     * scoping — it is harmless today only because this test method sends a
     * single request.
     */
    public function test_the_binding_endpoint_creates_no_account_for_an_unknown_invitation_token(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $before = User::query()->count();
        $token = $realm->mint(['email_verified' => true]);

        $attemptedUserInserts = 0;
        DB::listen(function ($query) use (&$attemptedUserInserts): void {
            $sql = strtolower($query->sql);
            if (str_starts_with(trim($sql), 'insert') && str_contains($sql, 'users')) {
                $attemptedUserInserts++;
            }
        });

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::BIND_ROUTE, ['token' => 'zaden-taki-token-nie-istnieje'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_token');

        $this->assertSame(0, $attemptedUserInserts, 'a rejected invitation token must not even attempt to insert an accounts row, whether or not it is later rolled back');
        $this->assertSame($before, User::query()->count(), 'a rejected invitation token must not add a row to the accounts table');
    }
}
