<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Unikalność zgody na trójkę (osoba, rodzaj dokumentu, wersja dokumentu).
     * Bez tego indeksu dwa równoległe żądania `POST …/accept` — obie
     * transakcje widzą brak wiersza przy sprawdzeniu `existing`, zanim
     * którakolwiek zdąży wstawić swój — dawały dwa wiersze `consents` i dwa
     * wpisy `audit_log` dla tej samej akceptacji (kontroler polega odtąd na
     * tym indeksie, łapiąc naruszenie zamiast blokować wiersz).
     *
     * Przed założeniem indeksu ten krok usuwa istniejące duplikaty trójki,
     * zostawiając w każdej grupie wiersz o najniższym `id` — `consents` jest
     * insert-only (bez `UPDATE`/`DELETE` z aplikacji), więc najniższe `id`
     * to zawsze najstarszy wiersz. `document_version` bywa `null` (zgody
     * bez wersjonowanego dokumentu, np. `marketing`) — te grupy nie wchodzą
     * w unikalność (NULL != NULL w indeksie) i nie są tu odduplikowywane.
     * Liczbę usuniętych wierszy loguje `Log::info` — migracja nie ma konsoli.
     */
    public function up(): void
    {
        $duplicateGroups = DB::table('consents')
            ->select('user_id', 'type', 'document_version')
            ->whereNotNull('document_version')
            ->groupBy('user_id', 'type', 'document_version')
            ->havingRaw('count(*) > 1')
            ->get();

        $deleted = 0;

        foreach ($duplicateGroups as $group) {
            $ids = DB::table('consents')
                ->where('user_id', $group->user_id)
                ->where('type', $group->type)
                ->where('document_version', $group->document_version)
                ->orderBy('id')
                ->pluck('id');

            $idsToDelete = $ids->slice(1)->values();

            if ($idsToDelete->isNotEmpty()) {
                $deleted += DB::table('consents')->whereIn('id', $idsToDelete)->delete();
            }
        }

        Log::info(sprintf(
            'Migracja consents_user_type_version_unique: usunięto %d zduplikowanych wierszy '.
            '(osoba, rodzaj, wersja) przed założeniem indeksu unikalnego.',
            $deleted,
        ));

        Schema::table('consents', function (Blueprint $table) {
            $table->unique(['user_id', 'type', 'document_version'], 'consents_user_type_version_unique');
        });
    }

    public function down(): void
    {
        Schema::table('consents', function (Blueprint $table) {
            $table->dropUnique('consents_user_type_version_unique');
        });
    }
};
