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
 * Rozpoznanie „już zaszyfrowany" jest próbą odszyfrowania: `Crypt::decryptString()`
 * rzuca wyjątek na zwykłym tekście JSON, więc każdy wiersz trafia do
 * dokładnie jednej z dwóch grup — nie ma trzeciego stanu do pomylenia.
 */
class EncryptDocumentSnapshots extends Command
{
    protected $signature = 'documents:encrypt-snapshots {--dry-run : tylko licz, nic nie zapisuj}';

    protected $description = 'Szyfruje jawne migawki dokumentów (data_snapshot) zapisane przed wprowadzeniem szyfrowania';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $toEncrypt = 0;
        $alreadyEncrypted = 0;

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
                // Nie odszyfrowało się — to jawny JSON sprzed zmiany, dalej.
            }

            $toEncrypt++;

            if ($dryRun) {
                continue;
            }

            DB::table('documents')
                ->where('id', $row->id)
                ->update(['data_snapshot' => Crypt::encryptString($row->data_snapshot)]);
        }

        $this->info(sprintf(
            '%s: %d do zaszyfrowania, %d już zaszyfrowanych.',
            $dryRun ? 'Tryb próbny' : 'Wykonano',
            $toEncrypt,
            $alreadyEncrypted
        ));

        return self::SUCCESS;
    }
}
