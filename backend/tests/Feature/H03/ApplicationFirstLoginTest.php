<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * `POST /api/v1/applications/first-login` — binding driven by the applicant's
 * accepted application rather than a one-time invitation token.
 */
class ApplicationFirstLoginTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/api/v1/applications/first-login';

    private function accepted(string $email): User
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create(['edition_id' => $edition->id, 'email' => $email]);
        $actor = User::factory()->role('project_manager')->create();
        $this->actingAs($actor, 'keycloak');

        $response = $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated();

        return User::findOrFail($response->json('data.user_id'));
    }

    public function test_binds_a_verified_matching_email_to_the_accepted_application(): void
    {
        $user = $this->accepted('kandydat.zweryfikowany@example.test');
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub, 'email' => $user->email, 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $user->refresh();
        $this->assertSame($sub, $user->keycloak_sub);
        $this->assertSame('active', $user->status);
        $this->assertNull($user->activation_token);
    }

    public function test_rejects_an_unverified_email(): void
    {
        $user = $this->accepted('kandydat.niezweryfikowany@example.test');
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['email' => $user->email, 'email_verified' => false]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'email_not_verified');

        $this->assertNull($user->fresh()->keycloak_sub);
    }

    public function test_rejects_an_email_not_matching_any_accepted_application(): void
    {
        $user = $this->accepted('kandydat.wlasciwy@example.test');
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['email' => 'ktos.inny@example.test', 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'invitation_not_found');

        $this->assertNull($user->fresh()->keycloak_sub);
    }

    public function test_rejects_a_token_from_a_foreign_issuer(): void
    {
        $user = $this->accepted('kandydat.obcy-wystawca@example.test');
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint([
            'email' => $user->email,
            'email_verified' => true,
            'iss' => 'https://kc.obcy.test/realms/obcy',
        ]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertStatus(401);

        $this->assertNull($user->fresh()->keycloak_sub);
    }

    public function test_returns_not_found_when_there_is_no_accepted_application_at_all(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['email' => 'nikt.nie.czeka@example.test', 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'invitation_not_found');
    }

    public function test_second_first_login_with_the_same_sub_is_a_no_op(): void
    {
        $user = $this->accepted('kandydat.powtorka@example.test');
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $token = $realm->mint(['sub' => $sub, 'email' => $user->email, 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)->postJson(self::ROUTE)->assertOk();
        $stateAfterFirstCall = $user->fresh()->only(['keycloak_sub', 'status', 'activation_token', 'updated_at']);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);

        $this->assertSame($stateAfterFirstCall, $user->fresh()->only(['keycloak_sub', 'status', 'activation_token', 'updated_at']));
    }

    public function test_a_sub_already_bound_to_another_account_is_refused(): void
    {
        $other = User::factory()->create(['keycloak_sub' => (string) Str::uuid()]);
        $user = $this->accepted('kandydat.zajety-sub@example.test');
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['sub' => $other->keycloak_sub, 'email' => $user->email, 'email_verified' => true]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE)
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'sub_already_bound');

        $this->assertNull($user->fresh()->keycloak_sub);
    }
}
