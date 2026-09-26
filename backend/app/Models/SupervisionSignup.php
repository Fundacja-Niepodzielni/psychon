<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupervisionSignup extends Model
{
    protected $fillable = [
        'slot_id',
        'user_id',
        'signed_up_at',
        'cancelled_at',
        'reminder_sent_at',
        'attendance',
        'attendance_marked_by',
    ];

    protected function casts(): array
    {
        return [
            'signed_up_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'reminder_sent_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<SupervisionSlot, $this>
     */
    public function slot(): BelongsTo
    {
        return $this->belongsTo(SupervisionSlot::class, 'slot_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function attendanceMarkedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'attendance_marked_by');
    }
}
