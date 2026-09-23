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
        'revoked_by',
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

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Edition, $this>
     */
    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
