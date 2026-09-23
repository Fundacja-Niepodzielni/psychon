<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $user_id
 * @property Carbon|null $date
 * @property string $hours
 * @property string $form
 * @property int $consultations_count
 * @property string|null $description
 * @property string $status
 * @property string|null $review_comment
 * @property int|null $decided_by
 * @property Carbon|null $decided_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read User $user
 * @property-read User|null $decidedBy
 */
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

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
