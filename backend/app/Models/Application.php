<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Application extends Model
{
    protected $fillable = [
        'edition_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'source',
        'role',
        'payload',
        'university',
        'graduation_year',
        'diploma_scan_path',
        'status',
        'rejection_reason',
        'decided_by',
        'decided_at',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'graduation_year' => 'integer',
            'decided_at' => 'datetime',
        ];
    }

    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
