<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Termin ważności pliku eksportu RODO (limit żądań + TTL pliku). Paczka z pełnym profilem
     * uczestnika nie może leżeć na dysku bez końca — job ustawia `expires_at`
     * przy zakończeniu, polecenie `exports:purge-expired` kasuje plik po tym
     * terminie, a pobranie po terminie kończy się 404 jak dla cudzego eksportu.
     * Kolumna jest nullable: wiersze sprzed tej zmiany nie mają terminu i
     * zostają dokładnie takie, jakie były.
     */
    public function up(): void
    {
        Schema::table('data_exports', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable()->after('completed_at');
            $table->index(['status', 'expires_at']); // wyszukanie paczek do skasowania
        });
    }

    public function down(): void
    {
        Schema::table('data_exports', function (Blueprint $table) {
            $table->dropIndex(['status', 'expires_at']);
            $table->dropColumn('expires_at');
        });
    }
};
