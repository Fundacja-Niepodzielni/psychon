<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pojedyncza wiadomość w wątku czatu. Wariant asynchroniczny — bez
 * edycji, bez kasowania wiadomości.
 */
class Message extends Model
{
    protected $fillable = [
        'thread_id',
        'sender_id',
        'body',
    ];

    /**
     * @return BelongsTo<MessageThread, $this>
     */
    public function thread(): BelongsTo
    {
        return $this->belongsTo(MessageThread::class, 'thread_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
