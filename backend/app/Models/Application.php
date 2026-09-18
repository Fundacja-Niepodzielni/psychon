<?php

namespace App\Models;

use Database\Factories\ApplicationFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Application extends Model
{
    /** @use HasFactory<ApplicationFactory> */
    use HasFactory;

    /**
     * Zgody zapisane w zgłoszeniu: typ z tabeli `consents` => kolumna daty.
     */
    public const CONSENT_COLUMNS = [
        'regulamin' => 'consent_regulamin_at',
        'polityka' => 'consent_polityka_at',
    ];

    protected $fillable = [
        'edition_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'source',
        'role',
        'payload',
        'university',
        'graduation_year',
        'diploma_scan_path',
        'consent_regulamin_at',
        'consent_polityka_at',
        'status',
        'rejection_reason',
        'decided_by',
        'decided_at',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'graduation_year' => 'integer',
            'decided_at' => 'datetime',
            'consent_regulamin_at' => 'datetime',
            'consent_polityka_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Edition, $this>
     */
    public function edition(): BelongsTo
    {
        return $this->belongsTo(Edition::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Restrict the queue to applications in a known workflow state.
     * Keeping the state scopes on the model avoids duplicating string
     * literals in services and tests.
     */
    public function scopeStatus(Builder $query, string $status): Builder
    {
        return $query->where($this->qualifyColumn('status'), $status);
    }

    public function scopeForEdition(Builder $query, int|Edition $edition): Builder
    {
        return $query->where(
            $this->qualifyColumn('edition_id'),
            $edition instanceof Edition ? $edition->getKey() : $edition,
        );
    }

    public function scopeNew(Builder $query): Builder
    {
        return $this->scopeStatus($query, 'new');
    }

    public function scopeAccepted(Builder $query): Builder
    {
        return $this->scopeStatus($query, 'accepted');
    }

    public function scopeRejected(Builder $query): Builder
    {
        return $this->scopeStatus($query, 'rejected');
    }
}
