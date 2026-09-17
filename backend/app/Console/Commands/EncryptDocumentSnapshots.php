<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Jednorazowe, idempotentne polecenie: wiersze `documents` zapisane jeszcze
 * jawnie (sprzed przejścia `Document::casts()` na `encrypted:array`) dostają
 * tę samą ochronę co PESEL i adres na koncie — migawka przeżywa usunięcie
 * konta, więc to nie jest kopia, która sama zniknie.
 *
 * Działa na surowej kolumnie (`DB::table`), nie przez model Eloquenta —
 * dzięki temu ponowne uruchomienie nigdy nie zaszyfruje wartości drugi raz.
 *
 * Rozpoznanie stanu wiersza jest dwustopniowe, żeby zmiana `APP_KEY` bez
 * dopisania starego klucza do `APP_PREVIOUS_KEYS` nie skończyła się cichym
 * drugim szyfrowaniem: `Crypt::decryptString()` sam próbuje bieżącego klucza
 * i wszystkich kluczy z `APP_PREVIOUS_KEYS` (obsługa wbudowana w szyfrator
 * Laravela), więc udane odszyfrowanie znaczy „już zaszyfrowany" niezależnie
 * od tego, którym z kluczy. Nieudane odszyfrowanie NIE oznacza od razu
 * „jawny JSON" — dopiero druga próba (poprawność formatu JSON) rozstrzyga.
 * Wiersz, którego nie da się ani odszyfrować, ani rozpoznać jako jawny JSON,
 * jest stanem, którego to polecenie nie umie bezpiecznie rozstrzygnąć —
 * przerywa całość, zanim cokolwiek zapisze, i wypisuje listę id.
 */
class EncryptDocumentSnapshots extends Command
{
    protected $signature = 'documents:encrypt-snapshots {--dry-run : tylko licz, nic nie zapisuj}';

    protected $description = 'Szyfruje jawne migawki dokumentów (data_snapshot) zapisane przed wprowadzeniem szyfrowania';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        /** @var array<int, string> $toEncrypt id => surowa wartość do zaszyfrowania */
        $toEncrypt = [];
        $alreadyEncrypted = 0;
        /** @var list<int> $unreadable */
        $unreadable = [];

        $rows = DB::table('documents')
            ->whereNotNull('data_snapshot')
            ->orderBy('id')
            ->select(['id', 'data_snapshot'])
            ->cursor();

        foreach ($rows as $row) {
            try {
                Crypt::decryptString($row->data_snapshot);
                $alreadyEncrypted++;

                continue;
            } catch (DecryptException) {
                // Nie odszyfrowało się żadnym znanym kluczem — może być jawny
                // JSON sprzed zmiany, ale może też być szyfrogram z klucza,
                // którego już nie znamy. Rozstrzyga kontrola formatu niżej.
            }

            json_decode($row->data_snapshot);

            if (json_last_error() !== JSON_ERROR_NONE) {
                $unreadable[] = $row->id;

                continue;
            }

            $toEncrypt[$row->id] = $row->data_snapshot;
        }

        if ($unreadable !== []) {
            $this->error(sprintf(
                'Przerwano: %d wiersz(y) tabeli documents nie da się ani odszyfrować znanym kluczem, '.
                'ani rozpoznać jako jawny JSON (id: %s). Nic nie zapisano — sprawdź, czy poprzedni '.
                'APP_KEY jest wpisany do APP_PREVIOUS_KEYS.',
                count($unreadable),
                implode(', ', $unreadable)
            ));

            return self::FAILURE;
        }

        if ($dryRun) {
            $this->info(sprintf(
                'Tryb próbny: %d do zaszyfrowania, %d już zaszyfrowanych.',
                count($toEncrypt),
                $alreadyEncrypted
            ));

            return self::SUCCESS;
        }

        DB::transaction(function () use ($toEncrypt): void {
            foreach ($toEncrypt as $id => $rawValue) {
                DB::table('documents')
                    ->where('id', $id)
                    ->update(['data_snapshot' => Crypt::encryptString($rawValue)]);
            }
        });

        $this->info(sprintf(
            'Wykonano: %d do zaszyfrowania, %d już zaszyfrowanych.',
            count($toEncrypt),
            $alreadyEncrypted
        ));

        return self::SUCCESS;
    }
}
