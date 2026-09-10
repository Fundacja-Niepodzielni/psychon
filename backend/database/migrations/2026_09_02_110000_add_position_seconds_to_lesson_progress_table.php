<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pozycja w materiale (kryterium ★ H06.1 — wznowienie po wylogowaniu).
     * Odrębna od `watched_seconds` i `active_seconds`: tamte tylko rosną, a pozycja
     * ma prawo maleć, bo uczestnik przewija materiał wstecz.
     * Kolumna addytywna, z wartością domyślną 0 — istniejące wiersze postępu
     * dostają pozycję „od początku" i nic w nich nie znika.
     */
    public function up(): void
    {
        Schema::table('lesson_progress', function (Blueprint $table) {
            $table->unsignedInteger('position_seconds')->default(0)->after('lesson_id');
        });
    }

    public function down(): void
    {
        Schema::table('lesson_progress', function (Blueprint $table) {
            $table->dropColumn('position_seconds');
        });
    }
};
