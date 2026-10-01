<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Jedno nagranie należy do jednej żywej lekcji — pilnuje tego baza, nie
     * tylko reguła żądania.
     *
     * Reguła `RecordingIdNotTaken` sprawdza wolność identyfikatora PRZED zapisem,
     * więc dwa równoczesne zapisy tego samego, wolnego jeszcze identyfikatora do
     * dwóch lekcji mogły oba przejść. Serwer podpisuje dostęp do nagrania
     * wpisanego w lekcję, a biblioteka nagrań jest jedna: powtórzenie dawałoby
     * dostęp do cudzego nagrania. Indeks jest ostatecznym strażnikiem.
     *
     * Indeks jest CZĘŚCIOWY i liczony na `lower(...)`:
     *  - tylko żywe lekcje (`deleted_at IS NULL`) — lekcja usunięta miękko zwalnia
     *    identyfikator, tak samo jak w regule żądania, a ścieżki przywrócenia
     *    usuniętej lekcji nie ma;
     *  - tylko niepusty identyfikator — wiele lekcji bez nagrania (`NULL` albo
     *    pusty napis) jest normalne;
     *  - bez rozróżniania wielkości liter — zapis zamienia identyfikator na małe
     *    litery, a indeks pilnuje tego samego także dla wartości zastanych.
     *
     * Migracja NIE zmienia danych. Jeśli w żywych lekcjach znajdzie powtórzony
     * identyfikator (po zrównaniu wielkości liter), zatrzymuje się z liczbą
     * powtórzeń w komunikacie — bez wartości identyfikatorów — i niczego nie
     * zakłada. Rozstrzygnięcie, które lekcje zachowują nagranie, jest decyzją
     * człowieka; wartość identyfikatora nie trafia do komunikatu, bo trafiłaby
     * do dziennika wdrożenia.
     */
    public function up(): void
    {
        $repeated = DB::table('lessons')
            ->whereNull('deleted_at')
            ->whereNotNull('video_provider_id')
            ->where('video_provider_id', '<>', '')
            ->selectRaw('count(*) as lessons_count')
            ->groupByRaw('lower(video_provider_id)')
            ->havingRaw('count(*) > 1')
            ->get();

        if ($repeated->isNotEmpty()) {
            throw new RuntimeException(sprintf(
                'Migracja zatrzymana: %d identyfikator(ów) nagrania powtarza się w %d żywych lekcjach '.
                '(porównanie bez rozróżniania wielkości liter). Nic nie zostało zmienione. '.
                'Rozstrzygnij powtórzenia (która lekcja zachowuje nagranie) i uruchom migrację ponownie.',
                $repeated->count(),
                (int) $repeated->sum('lessons_count'),
            ));
        }

        DB::statement(
            'CREATE UNIQUE INDEX lessons_video_provider_id_unique
             ON lessons (lower(video_provider_id))
             WHERE deleted_at IS NULL AND video_provider_id IS NOT NULL AND video_provider_id <> \'\''
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS lessons_video_provider_id_unique');
    }
};
