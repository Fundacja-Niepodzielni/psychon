<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_login_with_valid_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'login-test@demo.pl',
            'password' => 'demo1234',
            'role' => 'volunteer',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'login-test@demo.pl',
            'password' => 'demo1234',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'user' => ['id', 'first_name', 'last_name', 'email', 'role', 'access_expires_at', 'program_completed_at'],
                ],
            ])
            ->assertJsonPath('data.user.email', 'login-test@demo.pl');

        $this->assertNotEmpty($response->json('data.token'));
        $this->assertNotNull($user->fresh()->last_login_at);
    }

    public function test_login_with_wrong_password_fails_without_revealing_the_account(): void
    {
        User::factory()->create([
            'email' => 'login-test@demo.pl',
            'password' => 'demo1234',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'login-test@demo.pl',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.email.0', 'Nieprawidłowy e-mail lub hasło.');

        // Unknown account answers identically — existence is not revealed.
        $unknown = $this->postJson('/api/v1/auth/login', [
            'email' => 'nie-istnieje@demo.pl',
            'password' => 'whatever123',
        ]);

        $unknown->assertStatus(422)
            ->assertJsonPath('error.errors.email.0', 'Nieprawidłowy e-mail lub hasło.');
    }

    public function test_login_is_rate_limited_after_five_failed_attempts(): void
    {
        User::factory()->create([
            'email' => 'login-test@demo.pl',
            'password' => 'demo1234',
        ]);

        foreach (range(1, 5) as $attempt) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'login-test@demo.pl',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'login-test@demo.pl',
            'password' => 'demo1234', // even valid credentials are blocked now
        ]);

        $response->assertStatus(429)
            ->assertJsonPath('error.code', 'too_many_attempts')
            ->assertJsonPath('error.status', 429);
    }

    public function test_blocked_user_cannot_login(): void
    {
        User::factory()->create([
            'email' => 'blocked@demo.pl',
            'password' => 'demo1234',
            'status' => 'blocked',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'blocked@demo.pl',
            'password' => 'demo1234',
        ])->assertStatus(403)->assertJsonPath('error.code', 'forbidden');
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $user = User::factory()->create(['password' => 'demo1234']);

        $token = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'demo1234',
        ])->json('data.token');

        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }
}
