<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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
        DB::statement('ALTER TABLE documents ALTER COLUMN data_snapshot TYPE json USING data_snapshot::json');
    }
};
