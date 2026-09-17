<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * F-190 (odsłona 2): chwila (nie flaga — chwilę można później zbadać,
     * flagi nie) pokazania jednorazowego komunikatu "Twoje konto zostało
     * aktywowane" na pulpicie, przy pierwszym wejściu po powiązaniu konta
     * z dostawcą tożsamości (`users.keycloak_sub`). Nullable i addytywne —
     * ale KAŻDY wiersz obecny w bazie W CHWILI tej migracji jest kontem
     * zastanym, które nigdy komunikatu nie widziało i widzieć go teraz
     * (z powodu samej migracji) nie powinno — stąd backfill niżej, w tym
     * samym `up()`, a nie w kodzie aplikacji: kod aplikacji nie dobiegnie
     * do konta, które się nie zaloguje. Bez backfillu każde zastane konto
     * powiązane z dostawcą tożsamości dostałoby po migracji stan "pokaż".
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('activation_confirmation_shown_at')->nullable()->after('keycloak_sub');
        });

        // Wszystkie wiersze istniejące w tej chwili migracji — zastane konta —
        // dostają znacznik "już pokazano". Konta zakładane później mają NULL,
        // czyli poprawny stan "jeszcze nie pokazano" wyłącznie dla nich.
        DB::table('users')->update(['activation_confirmation_shown_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('activation_confirmation_shown_at');
        });
    }
};
