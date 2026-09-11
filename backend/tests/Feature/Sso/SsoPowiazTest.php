<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * `POST /api/v1/sso/powiaz` — the one-time invitation-token binding endpoint
 * (stage E1). Guarded by `auth.keycloak` (the principal middleware), never
 * the `keycloak` guard itself — there is no local user yet.
 */
class SsoPowiazTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/api/v1/sso/powiaz';

    public function test_binds_on_success_and_clears_the_token(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $user = User::factory()->invited()->create(['activation_token' => 'tok-'.Str::random(20)]);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(200)
            ->assertJsonPath('data.id', $user->id);

        $user->refresh();
        $this->assertSame($sub, $user->keycloak_sub);
        $this->assertNull($user->activation_token);
    }

    public function test_rejects_unknown_token(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ROUTE, ['token' => 'nie-ma-takiego'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_token');
    }

    public function test_rejects_a_second_use_of_the_same_token(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $user = User::factory()->invited()->create(['activation_token' => 'tok-'.Str::random(20)]);
        $originalToken = $user->activation_token;

        $this->withHeader('Authorization', 'Bearer '.$realm->mint())
            ->postJson(self::ROUTE, ['token' => $originalToken])
            ->assertStatus(200);

        $this->withHeader('Authorization', 'Bearer '.$realm->mint())
            ->postJson(self::ROUTE, ['token' => $originalToken])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_token');
    }

    public function test_rejects_when_user_already_bound_to_a_different_sub(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $user = User::factory()->create([
            'activation_token' => 'tok-'.Str::random(20),
            'keycloak_sub' => (string) Str::uuid(),
        ]);
        $newSub = (string) Str::uuid();

        $this->withHeader('Authorization', 'Bearer '.$realm->mint(['sub' => $newSub]))
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'already_bound');
    }

    public function test_rejects_when_the_sub_is_already_bound_to_another_user(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub]);
        $applicant = User::factory()->invited()->create(['activation_token' => 'tok-'.Str::random(20)]);

        $this->withHeader('Authorization', 'Bearer '.$realm->mint(['sub' => $sub]))
            ->postJson(self::ROUTE, ['token' => $applicant->activation_token])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'sub_already_bound');
    }

    public function test_rejects_a_blocked_user(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $user = User::factory()->create(['activation_token' => 'tok-'.Str::random(20), 'status' => 'blocked']);

        $this->withHeader('Authorization', 'Bearer '.$realm->mint())
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(403);
    }

    public function test_rejects_a_deleted_user(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $user = User::factory()->create(['activation_token' => 'tok-'.Str::random(20), 'status' => 'deleted']);

        $this->withHeader('Authorization', 'Bearer '.$realm->mint())
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(403);
    }

    public function test_rejects_an_anonymised_user(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $user = User::factory()->create(['activation_token' => 'tok-'.Str::random(20), 'anonymized_at' => now()]);

        $this->withHeader('Authorization', 'Bearer '.$realm->mint())
            ->postJson(self::ROUTE, ['token' => $user->activation_token])
            ->assertStatus(403);
    }
}
