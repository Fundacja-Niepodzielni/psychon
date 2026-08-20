<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only audit log (module 15.2). Never update or delete rows.
 * Write exclusively through the AuditLog::record facade.
 */
class AuditLogEntry extends Model
{
    public const ?string UPDATED_AT = null;

    protected $table = 'audit_log';

    protected $fillable = [
        'actor_id',
        'action',
        'subject_type',
        'subject_id',
        'details',
    ];

    protected function casts(): array
    {
        return [
            'details' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
