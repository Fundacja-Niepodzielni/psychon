<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Document extends Model
{
    protected $fillable = [
        'user_id',
        'edition_id',
        'type',
        'number',
        'data_snapshot',
        'pdf_path',
        'generated_at',
        'signature_status',
    ];

    protected function casts(): array
    {
        return [
            // Migawka niesie PESEL, telefon i adres, i w odróżnieniu od konta
            // nie jest usuwana razem z nim — więc leży w bazie szyfrowana,
            // tak samo jak te same dane na koncie (`User::casts()`).
            'data_snapshot' => 'encrypted:array',
            'generated_at' => 'datetime',
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
