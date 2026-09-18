<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $lesson_id
 * @property int $position_seconds
 * @property int $watched_seconds
 * @property int $active_seconds
 * @property int $open_count
 * @property \Illuminate\Support\Carbon|null $last_activity_at
 * @property bool $is_completed
 * @property \Illuminate\Support\Carbon|null $completed_at
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read User $user
 * @property-read Lesson $lesson
 */
class LessonProgress extends Model
{
    protected $table = 'lesson_progress';

    protected $fillable = [
        'user_id',
        'lesson_id',
        'position_seconds',
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
            'position_seconds' => 'integer',
            'watched_seconds' => 'integer',
            'active_seconds' => 'integer',
            'open_count' => 'integer',
            'last_activity_at' => 'datetime',
            'is_completed' => 'boolean',
            'completed_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Lesson, $this>
     */
    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }
}
