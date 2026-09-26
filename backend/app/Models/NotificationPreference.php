<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One person's preference for one notification type. A missing row means
 * the default: the e-mail copy is created.
 *
 * @property int $id
 * @property int $user_id
 * @property string $type
 * @property bool $email
 */
class NotificationPreference extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'email',
    ];

    protected function casts(): array
    {
        return [
            'email' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
