<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Edition extends Model
{
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

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(Application::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }
}
