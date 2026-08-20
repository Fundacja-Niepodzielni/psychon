<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Test extends Model
{
    protected $fillable = [
        'course_id',
        'pass_threshold',
        'attempts_limit',
        'question_count',
    ];

    protected function casts(): array
    {
        return [
            'pass_threshold' => 'integer', // null = edition value
            'attempts_limit' => 'integer', // null = edition value
            'question_count' => 'integer',
        ];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(TestQuestion::class)->orderBy('sequence_order');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(TestAttempt::class);
    }
}
