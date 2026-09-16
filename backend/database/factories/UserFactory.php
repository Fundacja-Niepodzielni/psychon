<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'role' => 'volunteer',
            'status' => 'active',
            'product_group' => 'psychon',
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    public function role(string $role): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => $role,
        ]);
    }

    /**
     * An invited account awaiting binding via `psychon:sso-powiaz` (no
     * `keycloak_sub` yet — SSO only, there is no password to await).
     */
    public function invited(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
            'activation_token' => Str::random(48),
        ]);
    }
}
