<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SensitiveAccessLogEntry extends Model
{
    protected $table = 'sensitive_access_log';

    protected $fillable = [
        'viewer_id',
        'file_type',
        'file_id',
        'viewed_at',
    ];

    protected function casts(): array
    {
        return [
            'viewed_at' => 'datetime',
        ];
    }

    public function viewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'viewer_id');
    }
}
