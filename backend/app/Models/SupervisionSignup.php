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
        'attendance',
        'attendance_marked_by',
    ];

    protected function casts(): array
    {
        return [
            'signed_up_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function slot(): BelongsTo
    {
        return $this->belongsTo(SupervisionSlot::class, 'slot_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attendanceMarkedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'attendance_marked_by');
    }
}
