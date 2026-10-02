<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Termin superwizji. Odwołany termin NIE znika: zostaje wierszem z
 * `cancelled_at` i `cancelled_by` (ustawia je wyłącznie
 * `SupervisionSlotService::cancel()`, dlatego obu kolumn nie ma w
 * `$fillable`). Odczyty uczestnika i prowadzącego biorą tylko terminy
 * zaplanowane (`scheduled()`); lista administracji pokazuje wszystkie.
 */
class SupervisionSlot extends Model
{
    public const string STATUS_SCHEDULED = 'scheduled';

    public const string STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'supervisor_id',
        'starts_at',
        'duration_minutes',
        'seats_limit',
        'location_or_link',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'duration_minutes' => 'integer',
            'seats_limit' => 'integer',
            'cancelled_at' => 'datetime',
            'cancelled_by' => 'integer',
        ];
    }

    public function isCancelled(): bool
    {
        return $this->cancelled_at !== null;
    }

    public function status(): string
    {
        return $this->isCancelled() ? self::STATUS_CANCELLED : self::STATUS_SCHEDULED;
    }

    /**
     * Wyłącznie terminy nieodwołane.
     *
     * @param  Builder<SupervisionSlot>  $query
     */
    public function scopeScheduled(Builder $query): void
    {
        $query->whereNull('cancelled_at');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    /**
     * @return HasMany<SupervisionSignup, $this>
     */
    public function signups(): HasMany
    {
        return $this->hasMany(SupervisionSignup::class, 'slot_id');
    }
}
