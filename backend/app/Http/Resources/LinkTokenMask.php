<?php

namespace App\Http\Resources;

/**
 * Jedna reguła maskowania odnośników z tokenem (zaproszenie, aktywacja) w
 * widokach administracji: podgląd skrzynki (`GET /admin/emails`) i ostatnie
 * powiadomienia na karcie osoby (`GET /admin/users/{id}`). Token należy
 * wyłącznie do adresata — administracja widzi odnośnik bez jego wartości.
 */
final class LinkTokenMask
{
    public const string MASK = '[ukryto]';

    /**
     * Wartość każdego parametru `token` w adresie (także zakodowanego jako
     * `&amp;token=`) zastąpiona znacznikiem; reszta tekstu bez zmian.
     */
    public static function apply(?string $text): ?string
    {
        if ($text === null) {
            return null;
        }

        return (string) preg_replace('/([?&](?:amp;)?token=)[^\s"\'<>&]+/i', '$1'.self::MASK, $text);
    }
}
