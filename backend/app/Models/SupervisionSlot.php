<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupervisionSlot extends Model
{
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
        ];
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
