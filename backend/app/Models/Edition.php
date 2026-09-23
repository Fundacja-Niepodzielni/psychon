<?php

namespace App\Models;

use Database\Factories\EditionFactory;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $name
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property int|null $seats_limit
 * @property int $reliability_threshold
 * @property int $test_pass_threshold
 * @property int $test_attempts_limit
 * @property int $internship_hours_required
 * @property int $supervision_required_count
 * @property int $lesson_completion_percent
 * @property string $status
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, User> $users
 * @property-read Collection<int, Application> $applications
 * @property-read Collection<int, Application> $acceptedApplications
 * @property-read Collection<int, Certificate> $certificates
 */
class Edition extends Model
{
    /** @use HasFactory<EditionFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'starts_at',
        'ends_at',
        'seats_limit',
        'reliability_threshold',
        'test_pass_threshold',
        'test_attempts_limit',
        'internship_hours_required',
        'supervision_required_count',
        'lesson_completion_percent',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'date',
            'ends_at' => 'date',
            'seats_limit' => 'integer',
            'reliability_threshold' => 'integer',
            'test_pass_threshold' => 'integer',
            'test_attempts_limit' => 'integer',
            'internship_hours_required' => 'integer',
            'supervision_required_count' => 'integer',
            'lesson_completion_percent' => 'integer',
        ];
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * @return HasMany<Application, $this>
     */
    public function applications(): HasMany
    {
        return $this->hasMany(Application::class);
    }

    /**
     * @return HasMany<Application, $this>
     */
    public function acceptedApplications(): HasMany
    {
        return $this->applications()->where('status', 'accepted');
    }

    /**
     * @return HasMany<Certificate, $this>
     */
    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }
}
