<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dwa rekordy dziedzinowe na powody wpisywane ręcznie przez administrację.
     *
     * Rejestr zdarzeń (`audit_log`) przyjmuje identyfikatory, kody i flagi, więc
     * treść powodu musi żyć gdzie indziej — w rekordzie, z którego anonimizacja
     * konta potrafi ją usunąć:
     *  - `users.blocked_reason` — powód blokady konta. Ustawiany przy blokadzie,
     *    zerowany przy odblokowaniu i przy anonimizacji;
     *  - `test_attempt_resets` — jeden wiersz na wyzerowanie podejść do testu
     *    (test, osoba, kto zerował, powód, ile podejść skasowano). Powód jest
     *    zerowany przy anonimizacji osoby; sam wiersz zostaje.
     *
     * Migracja tylko dodaje: istniejące konta dostają pusty powód, istniejące
     * wiersze innych tabel nie są zmieniane. `down()` zdejmuje wyłącznie
     * kolumnę i tabelę z tej migracji.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('blocked_reason')->nullable();
        });

        Schema::create('test_attempt_resets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_id')->constrained('tests')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reset_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->unsignedInteger('cleared');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['test_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('test_attempt_resets');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('blocked_reason');
        });
    }
};
