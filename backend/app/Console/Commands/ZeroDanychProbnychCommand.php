<?php

namespace App\Console\Commands;

use App\Services\Cutover\ProbeDataPurge;
use App\Services\Cutover\PurgeRefused;
use Illuminate\Console\Command;
use Throwable;

/**
 * `php artisan psychon:zero-danych-probnych --zachowaj=<plik>` - przejscie ze
 * srodowiska testowego na produkcje (procedura: deploy/PROCEDURA-PRZEJSCIA-TEST-PRODUKCJA.md,
 * lista kont: deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md).
 *
 * Domyslnie bieg na sucho: liczniki per tabela przed i po planowanym usunieciu,
 * zadnej zmiany. Bieg wlasciwy wylacznie z `--wykonaj` i `--potwierdz=<N>`,
 * gdzie N to liczba kont do usuniecia wypisana przez bieg na sucho; calosc
 * w jednej transakcji.
 *
 * Bez znacznika odtworzenia probnego kopii (krok 3 procedury) polecenie odmawia
 * i biegu na sucho, i wlasciwego. Znacznik zapisuje opcja `--zapisz-odtworzenie=<plik wyniku>`
 * (samodzielna), ale tylko z pliku wyniku, ktory konczy sie potwierdzeniem
 * sukcesu i nie niesie zadnej niezgodnosci.
 *
 * Czyszczenie jest jednorazowe: bieg wlasciwy zapisuje wpis `trial_data.purged`
 * w dzienniku zdarzen i znacznik startu produkcji, a od tej chwili kazdy
 * kolejny bieg (takze na sucho) konczy sie odmowa. Jedyna opcja, ktora dziala
 * po znaczniku, to `--sprawdz`: pomiar stanu po przejsciu (zero uczestnikow,
 * puste tabele sladow, dziennik od jednego wpisu, proba blokady dziennikow),
 * bez listy kont i bez zadnej zmiany w bazie. Nie laczy sie z `--wykonaj`,
 * `--potwierdz` ani `--zachowaj`.
 *
 * Wyjscie niesie wylacznie nazwy tabel i liczby - zadnych wartosci pol osob,
 * zadnej sciezki pliku listy kont. Polecenie nie pisze do logu; do dziennika
 * audytu zapisuje jedynie wpis `trial_data.purged` z biegu wlasciwego.
 *
 * Kody wyjscia: 0 - bieg zakonczony albo `--sprawdz` zaliczone; 2 - odmowa z
 * nazwana przyczyna, baza bez zmian; 1 - blad w trakcie biegu wlasciwego,
 * transakcja wycofana; 3 - `--sprawdz` wykryl niezgodnosc.
 */
class ZeroDanychProbnychCommand extends Command
{
    /** Kod wyjscia `--sprawdz`, gdy pomiar wykryl niezgodnosc. */
    private const int NIEZGODNOSC = 3;

    protected $signature = 'psychon:zero-danych-probnych
        {--zachowaj= : Plik poza repozytorium z identyfikatorami kont personelu do zachowania (jeden na wiersz)}
        {--wykonaj : Bieg wlasciwy; bez tej flagi bieg na sucho}
        {--potwierdz= : Liczba kont do usuniecia z biegu na sucho (wymagana przy --wykonaj)}
        {--sprawdz : Pomiar stanu po przejsciu (samodzielna opcja, niczego nie zmienia)}
        {--zapisz-odtworzenie= : Plik wyniku odtworzenia probnego kopii (krok 3); zapisuje znacznik wymagany przed biegiem (samodzielna opcja)}';

    protected $description = 'Usuwa osoby probne i ich slady przed przejsciem na produkcje (jednorazowo); domyslnie bieg na sucho, --sprawdz mierzy stan po przejsciu';

    public function handle(): int
    {
        $restoreResult = $this->stringOption('zapisz-odtworzenie');

        if ($restoreResult !== null) {
            return $this->recordRestoreTrial($restoreResult);
        }

        if ((bool) $this->option('sprawdz')) {
            return $this->verify();
        }

        $execute = (bool) $this->option('wykonaj');
        $this->line('psychon:zero-danych-probnych - '.($execute ? 'BIEG WLASCIWY' : 'BIEG NA SUCHO (nic nie jest zmieniane)'));

        try {
            ProbeDataPurge::refuseWhenProductionStarted();
            ProbeDataPurge::refuseWithoutRestoreTrial();

            $keepIds = ProbeDataPurge::readKeepList($this->stringOption('zachowaj'));

            $unknown = ProbeDataPurge::unclassifiedTables();
            if ($unknown !== []) {
                throw new PurgeRefused('Tabele bez kategorii (dopisz je w ProbeDataPurge przed biegiem): '.implode(', ', $unknown));
            }

            $roles = ProbeDataPurge::validateKeepList($keepIds);
            $this->line(sprintf(
                'KONTA zachowane=%d (super_admin=%d project_manager=%d instructor=%d)',
                array_sum($roles),
                $roles['super_admin'],
                $roles['project_manager'],
                $roles['instructor'],
            ));

            if (! $execute) {
                return $this->dryRun($keepIds);
            }

            $confirmation = $this->stringOption('potwierdz');
            if ($confirmation === null || preg_match('/^[0-9]+$/', $confirmation) !== 1) {
                throw new PurgeRefused('Bieg wlasciwy wymaga --potwierdz=<liczba kont do usuniecia z biegu na sucho>.');
            }

            $result = ProbeDataPurge::execute($keepIds, (int) $confirmation);
        } catch (PurgeRefused $refused) {
            $this->error('ODMOWA: '.$refused->getMessage());
            $this->line('Baza bez zmian.');

            return self::INVALID;
        } catch (Throwable $failure) {
            // Klasa wyjatku, bez jego tresci: komunikat bazy potrafi przytoczyc wartosc wiersza.
            $this->error('BLAD w trakcie biegu ('.class_basename($failure).'). Transakcja wycofana, baza bez zmian.');

            return self::FAILURE;
        }

        $this->printTables($result['plan'], 'usunieto');
        $files = $result['files'];
        $this->line(sprintf(
            'PLIKI wskazane=%d usunieto=%d brak_na_dysku=%d bledow=%d',
            $files['pointed'],
            $files['deleted'],
            $files['missing'],
            $files['failed'],
        ));
        $this->line(sprintf(
            'WYNIK BIEG_WLASCIWY usunieto_kont=%d osob_spoza_listy_po=%d',
            $result['plan']['users']['delete'],
            ProbeDataPurge::remainingProbeAccounts($keepIds),
        ));

        $state = ProbeDataPurge::startState();
        $this->line('ZNACZNIK start_produkcji='.($state['marker'] ? 'zapisany' : 'brak'));
        $this->line('DZIENNIK pierwszy_wpis='.($state['first_entry'] ?? 'brak'));

        return $files['failed'] === 0 && $state['marker'] ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Opcja --sprawdz: pomiar stanu po przejsciu. Samodzielna - z opcjami biegu
     * odmawia, zeby nie dalo sie jej pomylic z biegiem.
     */
    private function verify(): int
    {
        $this->line('psychon:zero-danych-probnych - SPRAWDZENIE PO PRZEJSCIU (nic nie jest zmieniane)');

        foreach (['wykonaj', 'potwierdz', 'zachowaj'] as $option) {
            $value = $this->option($option);

            if ($value !== null && $value !== false && $value !== '') {
                $this->error('ODMOWA: --sprawdz jest samodzielna opcja i nie laczy sie z --'.$option.'.');
                $this->line('Baza bez zmian.');

                return self::INVALID;
            }
        }

        try {
            $result = ProbeDataPurge::verify();
        } catch (Throwable $failure) {
            $this->error('BLAD w trakcie sprawdzenia ('.class_basename($failure).'). Baza bez zmian.');

            return self::FAILURE;
        }

        $probe = $result['probe'];
        $notEmpty = $result['trace_tables_not_empty'];

        $this->line('ZNACZNIK start_produkcji='.($result['marker'] ? 'zapisany' : 'brak'));
        $this->line('ZNACZNIK odtworzenie_probne='.($result['restore'] ? 'zapisany' : 'brak'));
        $this->line('SPRAWDZ uczestnicy='.$result['participants']);
        $this->line('SPRAWDZ slady_osob='.count($notEmpty).($notEmpty === [] ? '' : ' tabele='.implode(',', $notEmpty)));
        $this->line(sprintf('SPRAWDZ dziennik_audytu wierszy=%d pierwszy=%s', $result['audit_rows'], $result['audit_first'] ?? 'brak'));
        $this->line('SPRAWDZ dziennik_wgladu wierszy='.$result['access_rows']);
        $this->line(sprintf(
            'PROBA_DZIENNIKA usuniecie=%s zmiana=%s oproznienie=%s dopisanie=%s',
            $probe['usuniecie'],
            $probe['zmiana'],
            $probe['oproznienie'],
            $probe['dopisanie'],
        ));
        $this->line('WYNIK SPRAWDZ '.($result['passed'] ? 'ZALICZONE' : 'NIEZALICZONE'));

        return $result['passed'] ? self::SUCCESS : self::NIEZGODNOSC;
    }

    /**
     * Opcja --zapisz-odtworzenie: krok 3 procedury zostawia znacznik w bazie, ale
     * tylko gdy plik wyniku skryptu odtworzenia dowodzi sukcesu. Samodzielna.
     */
    private function recordRestoreTrial(string $resultFile): int
    {
        $this->line('psychon:zero-danych-probnych - ZAPIS ZNACZNIKA ODTWORZENIA PROBNEGO');

        try {
            foreach (['wykonaj', 'potwierdz', 'zachowaj', 'sprawdz'] as $option) {
                $value = $this->option($option);

                if ($value !== null && $value !== false && $value !== '') {
                    throw new PurgeRefused('--zapisz-odtworzenie jest samodzielna opcja i nie laczy sie z --'.$option.'.');
                }
            }

            ProbeDataPurge::confirmRestoreTrial($resultFile);
        } catch (PurgeRefused $refused) {
            $this->error('ODMOWA: '.$refused->getMessage());
            $this->line('Znacznik bez zmian.');

            return self::INVALID;
        } catch (Throwable $failure) {
            $this->error('BLAD w trakcie zapisu ('.class_basename($failure).'). Znacznik bez zmian.');

            return self::FAILURE;
        }

        $this->line('ZNACZNIK odtworzenie_probne=zapisany');

        return self::SUCCESS;
    }

    /**
     * @param  list<int>  $keepIds
     */
    private function dryRun(array $keepIds): int
    {
        $plan = ProbeDataPurge::plan($keepIds);
        $this->printTables($plan, 'usunac');

        $paths = ProbeDataPurge::filePaths();
        $this->line(sprintf(
            'PLIKI wskazane=%d istniejace=%d (dysk %s)',
            count($paths),
            ProbeDataPurge::existingFileCount($paths),
            ProbeDataPurge::DISK,
        ));

        $usersToDelete = $plan['users']['delete'];
        $rowsToDelete = array_sum(array_column($plan, 'delete'));
        $this->line(sprintf('WYNIK BIEG_NA_SUCHO usunac_kont=%d usunac_wierszy=%d', $usersToDelete, $rowsToDelete));
        $this->line("Bieg wlasciwy: php artisan psychon:zero-danych-probnych --zachowaj=<ten sam plik> --wykonaj --potwierdz={$usersToDelete}");

        return self::SUCCESS;
    }

    /**
     * @param  array<string, array{category: string, before: int, delete: int, after: int}>  $plan
     */
    private function printTables(array $plan, string $deleteLabel): void
    {
        foreach ($plan as $table => $row) {
            $this->line(sprintf(
                'TABELA %s przed=%d %s=%d po=%d kategoria=%s',
                $table,
                $row['before'],
                $deleteLabel,
                $row['delete'],
                $row['after'],
                $row['category'],
            ));
        }
    }

    private function stringOption(string $name): ?string
    {
        $value = $this->option($name);

        return is_string($value) && $value !== '' ? $value : null;
    }
}
