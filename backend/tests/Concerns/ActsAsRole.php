<?php

namespace Tests\Concerns;

use App\Models\User;

/**
 * H02 · Reusable role-authentication helper for permission tests across
 * every package. Creates a user with the given role and authenticates as
 * them via Sanctum — one call instead of hand-rolling `User::factory()->
 * create(['role' => ...])` + `actingAs()` in every test.
 */
trait ActsAsRole
{
    protected function actingAsRole(string $role, array $attributes = []): User
    {
        $user = User::factory()->create(array_merge(['role' => $role], $attributes));

        $this->actingAs($user, 'sanctum');

        return $user;
    }
}
