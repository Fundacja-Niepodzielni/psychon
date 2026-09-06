<?php

namespace App\Services\H08;

use Exception;

/**
 * Nośnik stanów „po", zmierzonych wewnątrz transakcji podglądu wpływu.
 *
 * Podgląd nie symuluje reguły odblokowań — pakietom nie wolno reimplementować
 * `App\Support\CourseAccess` — więc stosuje realną renumerację, mierzy stany
 * i wychodzi z transakcji **wyjątkiem**. Tylko to gwarantuje rollback także
 * wtedy, gdy pomiar przerwie się w połowie; `return` zostawiłby zmienioną
 * kolejność zatwierdzoną. Wyjątek łapie `ReorderImpactPreview` i nigdy nie
 * dociera do renderera błędów.
 */
final class RollbackPreview extends Exception
{
    /**
     * @param  array<string, string>  $states  klucz „<user_id>:<course_id>" → status
     */
    public function __construct(public readonly array $states)
    {
        parent::__construct('Podgląd wpływu zmiany kolejności — transakcja celowo wycofana.');
    }
}
