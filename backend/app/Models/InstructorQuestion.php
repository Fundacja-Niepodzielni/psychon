<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstructorQuestion extends Model
{
    protected $fillable = [
        'user_id',
        'lesson_id',
        'question',
        'answer',
        'answered_by',
        'answered_at',
    ];

    protected function casts(): array
    {
        return [
            'answered_at' => 'datetime',
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

    public function answeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'answered_by');
    }
}
