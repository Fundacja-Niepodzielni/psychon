<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class InternshipEntry extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'date',
        'hours',
        'form',
        'consultations_count',
        'description',
        'status',
        'review_comment',
        'decided_by',
        'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'hours' => 'decimal:1', // decimals travel as strings in the API ("2.5")
            'consultations_count' => 'integer',
            'decided_at' => 'datetime',
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
}
