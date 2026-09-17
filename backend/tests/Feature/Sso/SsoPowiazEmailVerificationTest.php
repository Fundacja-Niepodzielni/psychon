<?php

namespace Tests\Feature\Sso;

use App\Models\Application;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * `POST /api/v1/sso/powiaz` — the address/verification rule shared with
 * first login (`ApplicationFirstLoginBinder`): the bound account only turns
 * active when the bearer's e-mail is confirmed and matches the invited row.
 */
class SsoPowiazEmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/api/v1/sso/powiaz';

    private function invitedUser(): User
    {
        return User::factory()->invited()->create([
            'status' => 'invited',
            'activation_token' => 'tok-'.Str::random(20),
        ]);
    }

    public function test_confirmed_matching_address_binds_and_activates_the_account(): void
    {
        $user = $this->invitedUser();
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub, 'email' => $user->email, 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $user->refresh();
        $this->assertSame('active', $user->status);
        $this->assertSame($sub, $user->keycloak_sub);
        $this->assertNull($user->activation_token);
    }

    public function test_unverified_email_is_refused_and_leaves_the_user_unchanged(): void
    {
        $user = $this->invitedUser();
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['email' => $user->email, 'email_verified' => false]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'email_not_verified');

        $user->refresh();
        $this->assertSame('invited', $user->status);
        $this->assertNull($user->keycloak_sub);
        $this->assertNotNull($user->activation_token);
    }

    public function test_a_different_address_is_refused_and_leaves_the_user_unchanged(): void
    {
        $user = $this->invitedUser();
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['email' => 'nie-ten-adres@example.test', 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'invitation_not_found');

        $user->refresh();
        $this->assertSame('invited', $user->status);
        $this->assertNull($user->keycloak_sub);
        $this->assertNotNull($user->activation_token);
    }

    public function test_a_token_with_no_email_claim_is_refused_and_leaves_the_user_unchanged(): void
    {
        $user = $this->invitedUser();
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'invitation_not_found');

        $user->refresh();
        $this->assertSame('invited', $user->status);
        $this->assertNull($user->keycloak_sub);
        $this->assertNotNull($user->activation_token);
    }

    public function test_account_bound_through_the_invitation_link_then_calls_first_login_without_further_change(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create([
            'edition_id' => $edition->id,
            'email' => 'kandydat.przez-odnosnik@example.test',
        ]);
        $actor = User::factory()->role('project_manager')->create();
        $this->actingAs($actor, 'keycloak');
        $accepted = $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated();
        $user = User::findOrFail($accepted->json('data.user_id'));

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $bindToken = $realm->mint(['sub' => $sub, 'email' => $user->email, 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$bindToken)
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertOk();

        $stateAfterBinding = $user->fresh()->only(['keycloak_sub', 'status', 'activation_token'])
            + ['updated_at' => $user->fresh()->updated_at->toISOString()];

        $this->withHeader('Authorization', 'Bearer '.$bindToken)
            ->postJson('/api/v1/applications/first-login')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $stateAfterSecondCall = $user->fresh()->only(['keycloak_sub', 'status', 'activation_token'])
            + ['updated_at' => $user->fresh()->updated_at->toISOString()];
        $this->assertSame($stateAfterBinding, $stateAfterSecondCall);
    }
}
