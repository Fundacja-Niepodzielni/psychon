<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Skrzynka zespolu — czat pomocy
    |--------------------------------------------------------------------------
    | Adres skrzynki, na ktora trafia kopia kazdego zgloszenia z okna pomocy
    | (App\Services\Help\HelpMessageService). W repozytorium stoi wylacznie
    | nazwa zmiennej srodowiskowej — wartosc wpisuje wlasciciel na docelowym
    | hoscie, nigdy tutaj.
    */

    'inbox' => env('HELP_INBOX_ADDRESS'),

];
