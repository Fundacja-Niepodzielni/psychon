<?php

namespace App\Exceptions;

use App\Services\Keycloak\KeycloakGuardResolver;

/**
 * „Token jest ważny, konto istnieje, ale jest zablokowane” — odmowa strażnika
 * `keycloak`, która mówi o sobie wyłącznie posiadaczowi tego samego tokena.
 *
 * Koperta ma ten sam kształt i ten sam status co odmowa dla konta jeszcze
 * niepowiązanego ({@see AccountNotLinkedException}): 401, a od niej różni się
 * wyłącznie wartością istniejącego pola `code` — `konto_zablokowane`. Po tym
 * kodzie ekran logowania odróżnia konto zablokowane od konta niepowiązanego i od
 * sesji, która po prostu wygasła.
 *
 * Granice, obie celowe:
 *
 * 1. Rzuca ją jedno miejsce — {@see KeycloakGuardResolver} — dopiero po pełnej
 *    walidacji tokena (podpis, wystawca, odbiorca, ważność) i po sprawdzeniu
 *    unieważnionej sesji, więc stan konta wraca wyłącznie do osoby, której
 *    token aplikacja zna. Konto zanonimizowane i usunięte nadal dostaje zwykłą,
 *    nieodróżnialną odmowę.
 * 2. Odpowiedź niesie wyłącznie `status`, `code` i `message`: bez `reason`, bez
 *    powodu blokady, bez daty i bez identyfikatora osoby. Powód żyje w rekordzie
 *    i w dzienniku administracji.
 *
 * Nie jest raportowana: osoba z zablokowanym kontem może wołać API wielokrotnie,
 * a zwykła odmowa uwierzytelnienia też nie zostawiała wpisu w dzienniku.
 */
final class AccountBlockedException extends ApiException
{
    public const CODE = 'konto_zablokowane';

    public function __construct()
    {
        parent::__construct(401, self::CODE, 'To konto jest zablokowane.');
    }

    /** Nie zapisuj w dzienniku (patrz opis klasy). */
    public function report(): bool
    {
        return true;
    }
}
