<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $public_id
 * @property int $user_id
 * @property int $edition_id
 * @property string $type
 * @property string $number
 * @property array<string, mixed>|null $data_snapshot
 * @property string|null $pdf_path
 * @property \Illuminate\Support\Carbon|null $generated_at
 * @property string $signature_status
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read User $user
 * @property-read Edition $edition
 */
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

    protected static function booted(): void
    {
        // Identyfikator do adresu pobrania (patrz migracja `public_id`) —
        // losowy niezależnie od tego, czy ktoś go poda przy tworzeniu.
        static::creating(function (self $document): void {
            $document->public_id ??= (string) Str::uuid();
        });
    }

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
}
