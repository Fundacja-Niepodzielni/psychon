<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Wątek czatu asynchronicznego (sprint 3, poz. 10) — `individual` (uczestnik
 * i jego prowadzący) albo `group` (prowadzący i cały jego aktywny zespół).
 *
 * Członkostwo w wątku `group` NIE jest tu duplikowane — patrz
 * `App\Services\Chat\ChatThreadQuery::visibleTo()`, która czyta je na żywo
 * z `SupervisorAssignment` (`unassigned_at IS NULL`), zgodnie z zastrzeżeniem
 * zlecenia „nie duplikuj definicji grupy".
 */
class MessageThread extends Model
{
    protected $fillable = [
        'type',
        'supervisor_id',
        'volunteer_id',
    ];

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    public function volunteer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'volunteer_id');
    }

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
