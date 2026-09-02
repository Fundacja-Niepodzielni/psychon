<?php

namespace Tests\Concerns;

/**
 * Decyzja: co zrobić z testem współbieżności w danym środowisku.
 *
 * Wyjęta z traitu do osobnej klasy z jednego powodu: **musi dać się zmierzyć**.
 * W obrazie z `pcntl` dwie z trzech gałęzi nigdy się nie wykonują, więc kontrola
 * broniąca suity przed cichym pominięciem sama zostałaby bez świadka. Stałe
 * w traicie nie są dostępne przez jego nazwę (PHP), więc świadek nie miałby się
 * nawet do czego odwołać.
 *
 * Świadek: `tests/Unit/Przyrzad/RequiresProcessConcurrencyTest.php`.
 */
final class ConcurrencyRequirement
{
    public const RUN = 'run';

    public const SKIP = 'skip';

    public const FAIL = 'fail';

    /**
     * @param  bool  $hasPcntl  czy rozszerzenie jest dostępne
     * @param  string|null  $skipFlag  wartość `CONCURRENCY_TESTS_SKIP`, jeśli ustawiona
     */
    public static function decide(bool $hasPcntl, ?string $skipFlag): string
    {
        if ($hasPcntl) {
            // Rozszerzenie jest — flaga pominięcia NIE ma prawa nic pominąć.
            // Inaczej jedna zmienna środowiskowa wyłączałaby po cichu kontrole
            // współbieżności na w pełni sprawnej maszynie.
            return self::RUN;
        }

        // Pominięcie wymaga dokładnie „1". Literówka ani `0` nie są decyzją —
        // zgoda ma być zgodą, a nie skutkiem ubocznym niedopatrzenia.
        return $skipFlag === '1' ? self::SKIP : self::FAIL;
    }
}
