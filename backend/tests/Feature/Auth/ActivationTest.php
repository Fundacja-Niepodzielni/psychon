<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActivationTest extends TestCase
{
    use RefreshDatabase;

    public function test_invited_user_activates_the_account_and_can_login(): void
    {
        $user = User::factory()->invited()->create(['email' => 'invited@demo.pl']);

        $this->assertNull($user->password);

        $this->postJson('/api/v1/auth/activate', [
            'token' => $user->activation_token,
            'password' => 'noweHaslo123',
        ])->assertOk();

        $user->refresh();
        $this->assertNull($user->activation_token); // single use
        $this->assertNotNull($user->password);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'invited@demo.pl',
            'password' => 'noweHaslo123',
        ])->assertOk()->assertJsonStructure(['data' => ['token', 'user']]);
    }

    public function test_activation_with_invalid_token_fails(): void
    {
        $this->postJson('/api/v1/auth/activate', [
            'token' => 'not-a-real-token',
            'password' => 'noweHaslo123',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_invited_user_cannot_login_before_activation(): void
    {
        User::factory()->invited()->create(['email' => 'invited@demo.pl']);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'invited@demo.pl',
            'password' => 'cokolwiek123',
        ])->assertStatus(422);
    }
}
