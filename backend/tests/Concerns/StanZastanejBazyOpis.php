<?php

namespace Tests\Concerns;

/**
 * Nagłówek komunikatu o rozjeździe liczności tabel — ODRÓŻNIA przyrost od ubytku.
 *
 * Dwa zdarzenia wyglądają dla czytającego jednakowo, dopóki nagłówek nie nazwie ich
 * osobno, a znaczą coś przeciwnego: test DOPISAŁ dane (zostawił po sobie ślad, kolejny
 * test zastanie niepustą bazę) kontra ktoś WYCZYŚCIŁ bazę spod tego testu (kolejny test
 * zastanie pustkę tam, gdzie liczył na dane zaseedowane wcześniej). Wspólny nagłówek
 * „zostawił ślad" jest prawdziwy tylko dla pierwszego z nich, a przy drugim wysyła
 * czytającego szukać sprzątania w `tearDown`, którego nie brakuje — brakuje ochrony
 * PRZED cudzym czyszczeniem.
 *
 * Wyprowadzenie kierunku jest tu WYŁĄCZONE z zapytań do bazy celowo: przyjmuje gotowe
 * liczności `$przed`/`$po`, więc świadek testuje samą regułę nazywania bez łączenia
 * się z silnikiem.
 */
final class StanZastanejBazyOpis
{
    /**
     * @param  array<string, int>  $przed
     * @param  array<string, int>  $po
     */
    public static function naglowek(array $przed, array $po): string
    {
        $maPrzyrost = false;
        $maUbytek = false;

        foreach ($po as $tabela => $ile) {
            $bylo = $przed[$tabela] ?? 0;

            if ($ile > $bylo) {
                $maPrzyrost = true;
            }

            if ($ile < $bylo) {
                $maUbytek = true;
            }
        }

        return match (true) {
            $maPrzyrost && $maUbytek => 'Test bez `RefreshDatabase` zostawił MIESZANY rozjazd w bazie testowej '
                .'(część tabel przybyła, część ubyła):',
            $maPrzyrost => 'Test bez `RefreshDatabase` DOPISAŁ dane do bazy testowej — zostawił po sobie ślad:',
            $maUbytek => 'Test bez `RefreshDatabase` zastał bazę testową OKROJONĄ — ktoś ją WYCZYŚCIŁ spod niego, '
                .'to NIE jest „zostawił ślad", tylko ubytek:',
            default => 'Test bez `RefreshDatabase` zostawił rozjazd w bazie testowej bez zmiany żadnej liczności '
                .'(zestaw tabel się zmienił):',
        };
    }
}
