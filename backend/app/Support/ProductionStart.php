<?php

namespace App\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Znacznik startu produkcji: jeden wiersz w tabeli `settings`, zapisywany raz,
 * w tej samej transakcji co czyszczenie danych próbnych
 * (`psychon:zero-danych-probnych`, procedura: deploy/PROCEDURA-PRZEJSCIA-TEST-PRODUKCJA.md).
 *
 * Wartość to chwila wpisu `trial_data.purged` w dzienniku zdarzeń (ISO 8601 UTC).
 * Po zapisie polecenie czyszczące odmawia każdego kolejnego uruchomienia.
 *
 * Znacznik jest kluczem wewnętrznym, nieosiągalnym z API: żadna trasa nie
 * przyjmuje nazwy klucza `settings`, a model `Setting` odmawia zapisu i
 * usunięcia każdego klucza z listy RESERVED_KEYS (jedyne miejsce, w którym
 * ta lista stoi). Zapisuje go wyłącznie ta klasa, zapytaniem wprost.
 */
final class ProductionStart
{
    public const string KEY = 'production_started_at';

    /**
     * Klucze `settings`, których nie wolno zapisać ani usunąć przez model `Setting`.
     *
     * @var list<string>
     */
    public const array RESERVED_KEYS = [self::KEY, RestoreTrial::KEY];

    public static function isRecorded(): bool
    {
        return DB::table('settings')->where('key', self::KEY)->exists();
    }

    public static function recordedAt(): ?string
    {
        $value = DB::table('settings')->where('key', self::KEY)->value('value');

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * Zapisuje znacznik. Drugi zapis odmawia (klucz jest unikalny), nigdy nie nadpisuje.
     */
    public static function record(CarbonInterface $at): void
    {
        if (self::isRecorded()) {
            throw new LogicException('Znacznik startu produkcji już istnieje.');
        }

        DB::table('settings')->insert([
            'key' => self::KEY,
            'value' => $at->copy()->utc()->format('Y-m-d\TH:i:s\Z'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
