<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pojedyncza wiadomość w wątku czatu (sprint 3, poz. 10). Wariant
 * asynchroniczny — bez edycji, bez kasowania (zlecenie §„Czego NIE robisz").
 */
class Message extends Model
{
    protected $fillable = [
        'thread_id',
        'sender_id',
        'body',
    ];

    public function thread(): BelongsTo
    {
        return $this->belongsTo(MessageThread::class, 'thread_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
