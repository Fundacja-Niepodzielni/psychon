<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The API error envelope (contract §1) is the ONLY allowed error shape:
 * {"error": {"status", "code", "message", "errors"?, "reason"?}}.
 */
class ErrorEnvelopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_validation_error_uses_the_contract_envelope(): void
    {
        $response = $this->postJson('/api/v1/auth/login', []);

        $response->assertStatus(422)
            ->assertJsonStructure(['error' => ['status', 'code', 'message', 'errors']])
            ->assertJsonPath('error.status', 422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', 'Popraw zaznaczone pola.');

        $this->assertIsArray($response->json('error.errors.email'));
    }

    public function test_missing_token_returns_401_unauthenticated_envelope(): void
    {
        $this->getJson('/api/v1/me')
            ->assertStatus(401)
            ->assertJsonPath('error.status', 401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_unknown_route_returns_404_not_found_envelope(): void
    {
        $this->getJson('/api/v1/definitely-not-a-route')
            ->assertStatus(404)
            ->assertJsonPath('error.status', 404)
            ->assertJsonPath('error.code', 'not_found');
    }
}
