<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProfileDocument extends Model
{
    protected $fillable = [
        'profile_id',
        'type',
        'file_path',
        'uploaded_at',
    ];

    protected function casts(): array
    {
        return [
            'uploaded_at' => 'datetime',
        ];
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(PsychologistProfile::class, 'profile_id');
    }
}
