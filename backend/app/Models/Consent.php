<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Consent extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'document_version',
        'granted_at',
        'withdrawn_at',
    ];

    protected function casts(): array
    {
        return [
            'granted_at' => 'datetime',
            'withdrawn_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
