<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Zgloszenie z okna pomocy. `role` i `screen` to migawka z chwili wyslania
 * (rola z tokena, sciezka ekranu frontu w chwili wyslania) — zapisywane
 * wylacznie przez `App\Services\Help\HelpMessageService`, ktory tez wysyla
 * kopie do skrzynki zespolu i potwierdzenie do nadawcy.
 */
class HelpMessage extends Model
{
    protected $fillable = [
        'user_id',
        'role',
        'screen',
        'content',
        'reference',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
