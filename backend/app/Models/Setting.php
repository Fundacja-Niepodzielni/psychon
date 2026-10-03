<?php

namespace App\Models;

use App\Support\ProductionStart;
use Illuminate\Database\Eloquent\Model;
use LogicException;

class Setting extends Model
{
    protected $fillable = [
        'key',
        'value',
    ];

    /**
     * Klucze z `ProductionStart::RESERVED_KEYS` nie przechodzą przez ten model:
     * ani zapis, ani zmiana, ani usunięcie.
     */
    protected static function booted(): void
    {
        $guard = static function (Setting $setting): void {
            if (in_array($setting->getOriginal('key'), ProductionStart::RESERVED_KEYS, true)
                || in_array($setting->key, ProductionStart::RESERVED_KEYS, true)) {
                throw new LogicException('Ten klucz ustawień jest zarezerwowany.');
            }
        };

        static::saving($guard);
        static::deleting($guard);
    }
}
