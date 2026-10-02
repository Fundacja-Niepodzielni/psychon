<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Odwołanie terminu superwizji jako stan, a nie usunięcie wiersza.
     *
     * Dotąd odwołanie kasowało wiersz terminu, a klucz obcy
     * `supervision_signups.slot_id` (`cascadeOnDelete`) zabierał razem z nim
     * wszystkie zapisy, także historyczne; wpis audytu wskazywał wtedy wiersz,
     * którego już nie było. Od tej migracji termin zostaje, a odwołanie
     * zapisuje się w dwóch kolumnach:
     *  - `cancelled_at` — chwila odwołania; pusta znaczy „termin zaplanowany”;
     *  - `cancelled_by` — osoba z administracji, która odwołała termin; puste
     *    także wtedy, gdy jej konto zostało później usunięte (`nullOnDelete`).
     *
     * Migracja tylko dodaje: istniejące wiersze dostają puste wartości (żaden
     * termin nie staje się odwołany) i niczego nie przepisuje. `down()` zdejmuje
     * wyłącznie klucz obcy, indeks i obie kolumny.
     */
    public function up(): void
    {
        Schema::table('supervision_slots', function (Blueprint $table) {
            $table->timestamp('cancelled_at')->nullable()->index();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('supervision_slots', function (Blueprint $table) {
            $table->dropForeign(['cancelled_by']);
            $table->dropIndex(['cancelled_at']);
            $table->dropColumn(['cancelled_at', 'cancelled_by']);
        });
    }
};
