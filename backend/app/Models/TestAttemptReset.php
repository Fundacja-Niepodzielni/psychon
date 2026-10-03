<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Wyzerowanie podejść osoby do testu (`POST /admin/tests/{test}/users/{user}/reset-attempts`).
 * Powód wpisany przez administrację żyje tylko tutaj i jest zerowany przy
 * anonimizacji osoby; rejestr zdarzeń niesie wyłącznie identyfikator testu
 * i liczbę skasowanych podejść.
 */
class TestAttemptReset extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'test_id',
        'user_id',
        'reset_by',
        'reason',
        'cleared',
    ];

    protected function casts(): array
    {
        return [
            'cleared' => 'integer',
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
     * @return BelongsTo<Test, $this>
     */
    public function test(): BelongsTo
    {
        return $this->belongsTo(Test::class);
    }
}
