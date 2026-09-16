<?php

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `data_snapshot` przechodzi na szyfrowanie w aplikacji (model rzutuje
     * ją teraz jako `encrypted:array`). Zaszyfrowana wartość to nieprzezroczysty
     * ciąg znaków, a nie poprawny JSON, więc kolumna typu `json` odrzucałaby
     * zapis — stąd zmiana na `text`, tak samo jak przy analogicznych polach
     * konta (`pesel`, `address_*`).
     */
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->text('data_snapshot')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Postgres nie rzutuje `text` na `json` automatycznie (nawet gdy
        // treść jest poprawnym JSON-em) — Blueprint::change() nie ma jak
        // dołożyć klauzuli USING, więc down() idzie surowym SQL-em. Ta sama
        // zmiana nazad zerwałaby dane po uruchomieniu polecenia szyfrującego
        // (zaszyfrowany ciąg nie jest JSON-em) — rollback ma sens tylko
        // przed pierwszym uruchomieniem `documents:encrypt-snapshots`.
        //
        // Zanim ruszy ALTER, sprawdzamy wprost, czy taki wiersz istnieje —
        // inaczej rollback wysypałby się na błędzie Postgresa, a ten błąd
        // wypisuje w treści całą odrzuconą wartość (czyli szyfrogram) do
        // logu. Nasz komunikat niesie tylko liczbę, nigdy zawartość wiersza.
        $encrypted = 0;

        $rows = DB::table('documents')
            ->whereNotNull('data_snapshot')
            ->select('data_snapshot')
            ->cursor();

        foreach ($rows as $row) {
            try {
                Crypt::decryptString($row->data_snapshot);
                $encrypted++;
            } catch (DecryptException) {
                // Jawny JSON — nie liczy się do odmowy cofnięcia.
            }
        }

        if ($encrypted > 0) {
            throw new RuntimeException(sprintf(
                'Cofnięcie migracji odrzucone: %d wiersz(y) documents ma zaszyfrowaną migawkę '.
                '(data_snapshot). Kolumna typu json nie pomieści szyfrogramu — odszyfruj wiersze '.
                '(documents:encrypt-snapshots działa tylko w jedną stronę) przed cofnięciem.',
                $encrypted
            ));
        }

        DB::statement('ALTER TABLE documents ALTER COLUMN data_snapshot TYPE json USING data_snapshot::json');
    }
};
