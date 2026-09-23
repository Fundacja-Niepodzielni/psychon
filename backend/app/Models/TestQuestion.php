<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TestQuestion extends Model
{
    protected $fillable = [
        'test_id',
        'body',
        'sequence_order',
    ];

    protected function casts(): array
    {
        return [
            'sequence_order' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Test, $this>
     */
    public function test(): BelongsTo
    {
        return $this->belongsTo(Test::class);
    }

    /**
     * @return HasMany<TestAnswer, $this>
     */
    public function answers(): HasMany
    {
        return $this->hasMany(TestAnswer::class, 'question_id');
    }
}
