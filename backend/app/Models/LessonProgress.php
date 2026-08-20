<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LessonProgress extends Model
{
    protected $table = 'lesson_progress';

    protected $fillable = [
        'user_id',
        'lesson_id',
        'watched_seconds',
        'active_seconds',
        'open_count',
        'last_activity_at',
        'is_completed',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'watched_seconds' => 'integer',
            'active_seconds' => 'integer',
            'open_count' => 'integer',
            'last_activity_at' => 'datetime',
            'is_completed' => 'boolean',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }
}
