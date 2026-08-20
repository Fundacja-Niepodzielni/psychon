# Role i uprawnienia

Pięć ról + gość. Uprawnienia egzekwowane **na serwerze przy każdym żądaniu**; nawigacja
i strażnicy w przeglądarce tylko poprawiają wygodę. Każda reguła z tej matrycy musi mieć
test automatyczny (pozytywny i negatywny) — wymóg modułu 2.2.

## 1. Zasady ogólne

1. Brak uprawnienia do sekcji/akcji = 403 z czytelnym komunikatem, także przy ręcznym
   wpisaniu adresu. Wyjątek: **cudzy pojedynczy zasób wskazywany identyfikatorem → 404**
   (nie ujawniamy istnienia) — tabela decyzyjna kodów w kontrakcie API (hackathon §1.1).
2. Uprawnienia „do swoich" znaczą: relacja w bazie (moja grupa, mój kurs, mój wpis) —
   nie parametr z adresu.
3. Konta administracyjne (Super Admin, Opiekun): silne hasło wymuszane, opcjonalnie 2FA (⚠️),
   każde działanie w dzienniku działań.
4. Wygaśnięcie dostępu (`access_expires_at`) blokuje **materiały i funkcje programu**,
   nie logowanie — użytkownik po zalogowaniu widzi czytelny komunikat i kontakt.
5. Rola przypisywana wyłącznie przez Super Admina lub Opiekuna; zmiana roli = wpis w dzienniku.

## 2. Matryca uprawnień (MVP)

Legenda: ✔ pełny dostęp · S — tylko swoje / swoja grupa · — brak.

| Zasób / działanie | Gość | Student | Wolontariusz | Psycholog prowadzący | Opiekun Projektu | Super Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Logowanie, reset hasła | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Publiczna weryfikacja certyfikatu | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ekran „Zacznij tutaj" | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| Własny profil (dane, telefon, adres, PESEL) | — | S | S | S | S | S |
| Eksport własnych danych (RODO) | — | S | S | S | S | S |
| Kursy: przeglądanie i nauka | — | ✔ (zaproszone) | ✔ (ścieżka) | S (prowadzone + podgląd) | ✔ | ✔ |
| Testy: podejścia | — | S | S | — | — | — |
| Historia własnych podejść | — | S | S | — | ✔ | ✔ |
| Dziennik stażu: wpisy | — | — | S | — | podgląd ✔ | podgląd ✔ |
| Akceptacja wpisów stażu | — | — | — | — | ✔ | ✔ |
| Superwizja: zapisy na terminy | — | — | S (swój superwizor) | — | — | — |
| Superwizja: tworzenie terminów, obecność | — | — | — | S (swoja grupa) | ✔ | ✔ |
| Widok „moja grupa" z postępami | — | — | — | S | ✔ (wszyscy) | ✔ (wszyscy) |
| Pytania do prowadzącego | — | S (zadaje) | S (zadaje) | S (odpowiada na swoje) | ✔ | ✔ |
| Certyfikat: generowanie własnego | — | — | S (po warunkach) | — | — | — |
| Dokumenty: własne umowy/zaświadczenia | — | S | S | S | ✔ | ✔ |
| Profil psychologa: wniosek | — | — | S (po ukończeniu) | — | — | — |
| Weryfikacja profili psychologów | — | — | — | — | ✔ | ✔ |
| Wgląd w dokumenty wrażliwe (skany) | — | — | — | — | ✔ (z rejestrem wglądów) | ✔ (z rejestrem wglądów) |
| Powiadomienia własne (dzwonek) | — | S | S | S | S | S |
| Panel: kolejka zgłoszeń rekrutacyjnych | — | — | — | — | ✔ | ✔ |
| Panel: zarządzanie kontami | — | — | — | — | ✔ | ✔ |
| Panel: nadawanie roli Super Admin | — | — | — | — | — | ✔ |
| Panel: CMS kursów i lekcji | — | — | — | — | ✔ | ✔ |
| Panel: przypisywanie prowadzących | — | — | — | — | ✔ | ✔ |
| Panel: przedłużanie dostępu | — | — | — | — | ✔ | ✔ |
| Panel: warsztat — odznaczenie zaliczenia | — | — | — | — | ✔ | ✔ |
| Panel: rzetelność czasu nauki | — | — | — | S (swoja grupa) | ✔ | ✔ |
| Panel: ustawienia edycji | — | — | — | — | ✔ | ✔ |
| Raport z edycji, eksporty CSV | — | — | — | — | ✔ | ✔ |
| Dziennik działań (odczyt) | — | — | — | — | ✔ | ✔ |
| Dziennik działań (edycja/usuwanie) | — | — | — | — | — | — (nikt) |
| Skrzynka wysłanych e-maili | — | — | — | — | ✔ | ✔ |
| Moduły finansowe (faza 2: DOBROstan, przychody) | — | — | — | — | — | ✔ |

## 3. Różnica Student vs Wolontariusz

Student to węższa ścieżka: kursy i wydarzenia, **bez** stażu, superwizji, certyfikatu
zawodowego i profilu psychologa. Technicznie: te same mechanizmy kursowe, inne uprawnienia
i inna nawigacja. Makieta: konto `filip@demo.pl`.

## 4. Relacje nadające uprawnienia „S"

| Relacja | Tabela źródłowa | Nadaje |
|---|---|---|
| prowadzący → kurs/lekcja | `course_assignments` | podgląd kursu, skrzynka pytań z tego kursu |
| superwizor → wolontariusz | `supervisor_assignments` | widok grupy, terminy, obecności, rzetelność grupy |
| opiekun → wpis stażu | rola Opiekun (globalna) | akceptacja/odesłanie wpisu |
| właściciel → dokument/profil/certyfikat | `user_id` w rekordzie | odczyt, pobranie |

## 5. Wymagane testy uprawnień (minimum)

Dla każdej roli zestaw testów automatycznych: (a) dostęp do własnych zasobów działa,
(b) dostęp do cudzych zwraca 403, (c) trasy panelu zwracają 403 dla ról nieadministracyjnych,
(d) wygaśnięcie dostępu blokuje materiały, ale nie logowanie i nie eksport RODO,
(e) prowadzący nie widzi grupy innego prowadzącego, (f) nikt nie modyfikuje dziennika działań.
