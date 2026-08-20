<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Certificate extends Model
{
    protected $fillable = [
        'user_id',
        'edition_id',
        'number',
        'issued_at',
        'pdf_path',
        'verification_token',
        'conditions_snapshot',
        'revoked_at',
        'revoked_reason',
    ];

    protected $hidden = [
        'verification_token',
    ];

    protected function casts(): array
    {
        return [
            'issued_at' => 'datetime',
            'conditions_snapshot' => 'array',
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }
}
