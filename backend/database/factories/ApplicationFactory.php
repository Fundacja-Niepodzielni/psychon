<?php

namespace Database\Factories;

use App\Models\Application;
use App\Models\Edition;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Application>
 */
class ApplicationFactory extends Factory
{
    protected $model = Application::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'edition_id' => Edition::factory(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => 'candidate+'.fake()->unique()->numberBetween(1000, 999999).'@example.test',
            'phone' => '+48 500 000 000',
            'source' => 'demo',
            'role' => 'volunteer',
            'payload' => null,
            'university' => 'Uniwersytet Demo',
            'graduation_year' => fake()->numberBetween(2010, 2025),
            'diploma_scan_path' => null,
            'status' => 'new',
            'rejection_reason' => null,
            'decided_by' => null,
            'decided_at' => null,
            'user_id' => null,
        ];
    }

    public function accepted(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => 'accepted',
        ]);
    }

    public function rejected(?string $reason = null): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => 'rejected',
            'rejection_reason' => $reason ?? 'Nie spełnia kryteriów edycji.',
        ]);
    }
}
