<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * In-app bell notification (module 13.1).
 * Create exclusively through the Notify::send facade.
 */
class Notification extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'title',
        'body',
        'link',
        'read_at',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
