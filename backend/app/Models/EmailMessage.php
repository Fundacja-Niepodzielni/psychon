<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Sent-mailbox record (module 13.2). During the hackathon everything
 * is stored with status `simulated` — nothing leaves the system.
 */
class EmailMessage extends Model
{
    protected $table = 'emails';

    protected $fillable = [
        'to_email',
        'to_user_id',
        'subject',
        'body_html',
        'status',
        'related_type',
        'related_id',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }

    public function toUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }
}
