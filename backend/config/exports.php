<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Eksport danych osobowych (RODO, H01)
    |--------------------------------------------------------------------------
    |
    | Paczka eksportu zawiera komplet danych uczestnika, więc nie leży na dysku
    | dłużej niż `ttl_hours` od przygotowania. Limit żądań chroni kolejkę przed
    | zwielokrotnieniem tego samego zadania: pierwszy nieukończony eksport
    | blokuje kolejne (409 `export_in_progress`), a `rate_limit` domyka resztę
    | (429 `too_many_attempts`).
    |
    */

    'ttl_hours' => (int) env('NP_EXPORT_TTL_HOURS', 24),

    // Format middleware `throttle`: <liczba żądań>,<okno w minutach>.
    'rate_limit' => env('NP_EXPORT_RATE_LIMIT', '3,60'),

];
