<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Podejścia do testów wiedzy (H10)
    |--------------------------------------------------------------------------
    |
    | Dwuklik w „wyślij test” wysyła to samo zgłoszenie dwa razy. Drugie z nich
    | nie może zużyć kolejnego podejścia: jeżeli w oknie `duplicate_window_seconds`
    | istnieje już podejście tej osoby do tego testu z identycznym zestawem
    | odpowiedzi, serwer odpowiada wynikiem TAMTEGO podejścia zamiast zakładać
    | drugie. Okno liczone jest od `created_at` istniejącego podejścia; wartość 0
    | wyłącza zabezpieczenie (każde zgłoszenie zakłada nowe podejście).
    |
    | Okno jest krótkie z rozmysłem: ma pokryć podwójne kliknięcie i ponowienie
    | żądania, a nie świadome wysłanie tych samych odpowiedzi jeszcze raz.
    |
    */

    'duplicate_window_seconds' => (int) env('NP_ATTEMPT_DUPLICATE_WINDOW_SECONDS', 10),

];
