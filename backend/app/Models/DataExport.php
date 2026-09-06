<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * A single RODO data-export request (H01). The `public_id` is what the API
 * exposes ("ex_…"); routes bind on it so internal ids never leak.
 */
class DataExport extends Model
{
    protected $fillable = [
        'public_id',
        'user_id',
        'status',
        'file_path',
        'error',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $export): void {
            $export->public_id ??= self::generatePublicId();
            $export->status ??= 'queued';
        });
    }

    public static function generatePublicId(): string
    {
        do {
            $candidate = 'ex_'.Str::lower(Str::random(9));
        } while (self::where('public_id', $candidate)->exists());

        return $candidate;
    }

    /** Route-model binding uses the public id, not the auto-increment key. */
    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
