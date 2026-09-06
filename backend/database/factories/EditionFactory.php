<?php

namespace Database\Factories;

use App\Models\Edition;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Edition>
 */
class EditionFactory extends Factory
{
    protected $model = Edition::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => 'Edycja '.fake()->year(),
            'starts_at' => now()->startOfYear(),
            'ends_at' => null,
            'seats_limit' => 40,
            'reliability_threshold' => 60,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ];
    }
}
