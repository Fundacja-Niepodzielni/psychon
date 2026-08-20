<?php

/*
|--------------------------------------------------------------------------
| Feature flags — one per hackathon package (guide §5)
|--------------------------------------------------------------------------
| Enabled by default. A feature unfinished at code freeze is switched off
| here (config('features.hXX')) instead of being reverted.
*/

return [
    'h01' => true, // Profil użytkownika i eksport RODO
    'h02' => true, // Uprawnienia — test-kit matrycy
    'h03' => true, // Rekrutacja — kolejka zgłoszeń
    'h04' => true, // Dostęp czasowy
    'h05' => true, // Katalog kursów i sekwencyjne odblokowanie
    'h06' => true, // Lekcja — odtwarzacz i postęp
    'h07' => true, // Pomiar czasu nauki i rzetelność
    'h08' => true, // CMS treści
    'h09' => true, // Prowadzący — wizytówki i przypisania
    'h10' => true, // Testy wiedzy + warsztat
    'h11' => true, // Staż — dziennik i akceptacje
    'h12' => true, // Superwizja — terminy, zapisy, obecności
    'h13' => true, // Certyfikaty + weryfikacja publiczna
    'h14' => true, // Dokumenty generowane z profilu
    'h15' => true, // Profil psychologa
    'h16' => true, // Powiadomienia — dzwonek + e-maile symulowane
    'h17' => true, // Pytania do prowadzącego
    'h18' => true, // Panel — osoby i karta osoby
    'h19' => true, // Panel — pulpit i ustawienia edycji
    'h20' => true, // Raporty i widoki dziennika działań
    'h21' => true, // Onboarding „Zacznij tutaj"
];
