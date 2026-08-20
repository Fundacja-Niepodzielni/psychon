<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PsychologistProfile extends Model
{
    protected $fillable = [
        'user_id',
        'specializations',
        'approach',
        'city',
        'bio',
        'publication_consent_at',
        'status',
        'return_reason',
        'decided_by',
        'decided_at',
        'published_at',
        'external_id',
    ];

    protected function casts(): array
    {
        return [
            'specializations' => 'array',
            'publication_consent_at' => 'datetime',
            'decided_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(ProfileDocument::class, 'profile_id');
    }
}
