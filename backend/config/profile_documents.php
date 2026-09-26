<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Szyfrowanie załączników wniosku o wpis do bazy psychologów (H15)
    |--------------------------------------------------------------------------
    |
    | Załączniki (dyplom, zaświadczenie o niekaralności) leżą na dysku
    | zaszyfrowane osobnym kluczem — nie `APP_KEY`, żeby rotacja jednego
    | klucza nie wymuszała ponownego szyfrowania drugiego. Wartość klucza
    | nigdy nie trafia do repozytorium; tu jest wyłącznie nazwa zmiennej
    | środowiskowej, którą uzupełnia właściciel środowiska.
    |
    | Format zgodny z `APP_KEY`: `base64:` i 32 bajty po zdekodowaniu
    | (AES-256-CBC). Brak wartości w konfiguracji kończy się wyjątkiem
    | o własnej nazwie, nie ogólnym błędem szyfratora.
    |
    */

    'encryption_key' => env('NP_PROFILE_DOCUMENT_ENCRYPTION_KEY'),

];
