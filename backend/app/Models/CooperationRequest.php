<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Zgłoszenie dalszej współpracy złożone po zakończeniu programu.
 *
 * @property int $id
 * @property int $user_id
 * @property string $body
 * @property string $status
 * @property string|null $response
 * @property int|null $responded_by
 * @property Carbon|null $responded_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $user
 */
class CooperationRequest extends Model
{
    public const array STATUSES = ['new', 'answered', 'closed'];

    /** Zgłoszenie „otwarte” blokuje złożenie kolejnego (409). */
    public const array OPEN_STATUSES = ['new'];

    protected $fillable = [
        'user_id',
        'body',
        'status',
        'response',
        'responded_by',
        'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'responded_by' => 'integer',
            'responded_at' => 'datetime',
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
