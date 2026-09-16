<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Wątek czatu asynchronicznego — `individual` (uczestnik i jego prowadzący)
 * albo `group` (prowadzący i cały jego aktywny zespół).
 *
 * Członkostwo w wątku `group` NIE jest tu duplikowane — patrz
 * `App\Services\Chat\ChatThreadQuery::visibleTo()`, która czyta je na żywo
 * z `SupervisorAssignment` (`unassigned_at IS NULL`), żeby nie powstały dwa
 * miejsca odpowiadające różnie na pytanie „kto jest w grupie".
 */
class MessageThread extends Model
{
    protected $fillable = [
        'type',
        'supervisor_id',
        'volunteer_id',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function volunteer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'volunteer_id');
    }

    /**
     * @return HasMany<Message, $this>
     */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class, 'thread_id');
    }

    public function isIndividual(): bool
    {
        return $this->type === 'individual';
    }

    public function isGroup(): bool
    {
        return $this->type === 'group';
    }
}
