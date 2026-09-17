<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Zgody złożone w zewnętrznym formularzu Fundacji, zapisane razem z datą
     * ich udzielenia. Typy odpowiadają słownikowi tabeli `consents`
     * (`regulamin`, `polityka`); przy przyjęciu zgłoszenia daty są
     * przepisywane do `consents` dla nowo założonego konta.
     */
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->timestamp('consent_regulamin_at')->nullable()->after('diploma_scan_path');
            $table->timestamp('consent_polityka_at')->nullable()->after('consent_regulamin_at');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn(['consent_regulamin_at', 'consent_polityka_at']);
        });
    }
};
