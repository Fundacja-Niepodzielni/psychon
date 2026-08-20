<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstructorProfile extends Model
{
    protected $fillable = [
        'user_id',
        'specializations',
        'bio',
        'experience',
        'city',
        'responsibilities',
        'supervisor_id',
    ];

    protected function casts(): array
    {
        return [
            'specializations' => 'array',
            'responsibilities' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }
}
