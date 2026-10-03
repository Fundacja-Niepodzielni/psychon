<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Jedna zmiana daty wygaśnięcia dostępu osoby, z powodem podanym przez
 * administrację. Wiersze są dopisywane, nigdy edytowane; jedyną zmianą
 * po zapisie jest wyczyszczenie powodu przy anonimizacji konta osoby.
 *
 * @property int $id
 * @property int $user_id
 * @property int|null $changed_by
 * @property Carbon|null $previous_expires_at
 * @property Carbon $new_expires_at
 * @property string $reason
 * @property Carbon|null $created_at
 * @property-read User|null $user
 */
class AccessDateChange extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'changed_by',
        'previous_expires_at',
        'new_expires_at',
        'reason',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'changed_by' => 'integer',
            'previous_expires_at' => 'datetime',
            'new_expires_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
