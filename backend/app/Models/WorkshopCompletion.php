<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkshopCompletion extends Model
{
    protected $fillable = [
        'user_id',
        'edition_id',
        'completed_at',
        'marked_by',
    ];

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
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

    public function markedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'marked_by');
    }
}
