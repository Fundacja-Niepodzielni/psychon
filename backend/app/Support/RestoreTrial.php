<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Znacznik potwierdzonego odtworzenia probnego kopii bazy (krok 3 procedury
 * przejscia: deploy/PROCEDURA-PRZEJSCIA-TEST-PRODUKCJA.md). Jeden wiersz w tabeli
 * `settings`; bez niego polecenie `psychon:zero-danych-probnych` nie czyści
 * i nie robi biegu na sucho.
 *
 * Znacznik zapisuje wylacznie opcja `--zapisz-odtworzenie=<plik wyniku>` tego
 * polecenia, po sprawdzeniu pliku wyniku skryptu odtworzenia. Jest kluczem
 * wewnetrznym, tak samo jak `ProductionStart`: nieosiagalny z API, a model
 * `Setting` odmawia jego zapisu i usuniecia (lista `ProductionStart::RESERVED_KEYS`).
 * Wartosc to chwila zapisu (ISO 8601 UTC).
 */
final class RestoreTrial
{
    public const string KEY = 'restore_trial_confirmed_at';

    public static function isRecorded(): bool
    {
        return DB::table('settings')->where('key', self::KEY)->exists();
    }

    /**
     * Zapisuje znacznik; ponowny zapis (np. po nowej kopii) odswieza chwile.
     */
    public static function record(): void
    {
        $now = now();

        DB::table('settings')->updateOrInsert(
            ['key' => self::KEY],
            [
                'value' => $now->copy()->utc()->format('Y-m-d\TH:i:s\Z'),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
    }
}
