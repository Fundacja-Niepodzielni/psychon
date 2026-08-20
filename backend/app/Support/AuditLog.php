<?php

namespace App\Support;

use App\Models\AuditLogEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Append-only audit log writer. FROZEN SIGNATURE — changes only via the
 * integration staff. Action slugs exclusively from the API contract §3.2.
 */
final class AuditLog
{
    /**
     * Record an audit event inside a transaction. When called within an
     * outer transaction (a decision + its audit entry), it joins it, so the
     * entry is written atomically with the decision.
     */
    public static function record(
        User|int|null $actor,
        string $action,
        ?Model $subject = null,
        array $details = [],
    ): AuditLogEntry {
        return DB::transaction(fn (): AuditLogEntry => AuditLogEntry::create([
            'actor_id' => $actor instanceof User ? $actor->id : $actor,
            'action' => $action,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'details' => $details !== [] ? $details : null,
        ]));
    }
}
