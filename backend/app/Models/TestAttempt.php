<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TestAttempt extends Model
{
    protected $fillable = [
        'user_id',
        'test_id',
        'attempt_number',
        'answers',
        'questions_snapshot',
        'score_percent',
        'passed',
    ];

    protected function casts(): array
    {
        return [
            'attempt_number' => 'integer',
            'answers' => 'array',
            'questions_snapshot' => 'array',
            'score_percent' => 'integer',
            'passed' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function test(): BelongsTo
    {
        return $this->belongsTo(Test::class);
    }
}
