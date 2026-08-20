# Seed demo — kanoniczny stan danych (źródło prawdy dla kryteriów akceptacji)

Kryteria pakietów odwołują się do TYCH wartości. Seeder startera musi je odtwarzać
co do liczby; `docker compose down -v && setup` przywraca dokładnie ten stan.
Wariant B: konta wspólne (bez kopii per zespół) — staging resetowany do tego stanu
o pełnych godzinach, lokalnie każdy resetuje kiedy chce.

## 1. Edycja

Jedna aktywna: **„Edycja 2026"** · `starts_at` 2026-10-01 · `seats_limit` 40 ·
progi = wartości domyślne z kontraktu §3.3 (80 / 3 / 72 / 6 / 60 / 60).

## 2. Konta demo (hasła: demo1234, administracyjne: admin1234)

| Konto | Rola | Stan |
|---|---|---|
| `marta@demo.pl` | volunteer | **w trakcie programu** — patrz §3 |
| `ola@demo.pl` | volunteer | **absolwentka**: 10/10 etapów, testy zdane, 72 h zaakceptowane, 6 obecności, warsztat TAK, `program_completed_at` ustawione, certyfikat NP/2026/001 wydany, profil psychologa `draft` gotowy do złożenia |
| `filip@demo.pl` | student | ścieżka studenta: 1 kurs „zaproszony" poza sekwencją; **konto „przeklikane"**: 5 lekcji ukończonych z rzetelnością ≈15% (`active_seconds` = 15% długości) |
| `joanna@demo.pl` | instructor | prowadzi kursy 1–3; superwizorka marty; 2 nadchodzące terminy superwizji (limit 3 miejsca, jeden zapełniony 2/3); 1 pytanie bez odpowiedzi |
| `opiekun@demo.pl` | project_manager | 2 wpisy stażu w kolejce do akceptacji; 1 zgłoszenie rekrutacyjne `new` |
| `admin@demo.pl` | super_admin | — |

## 3. Stan bazowy `marta@demo.pl` (liczby wiążące dla H05/H07/H13/H18/H19/H20)

| Miara | Wartość |
|---|---|
| kursy | kurs 1: `completed` 100% · kurs 2: `in_progress` 40% (2/5 lekcji) · kursy 3–10: `locked` |
| test kursu 1 | zdany, 90%, podejście 1/3 |
| test kursu 2 | 1 podejście niezaliczone (70%), pozostały 2 |
| rzetelność | ≈85% (bez flagi poniżej progu) |
| staż | **41,5 h zaakceptowane** (9 wpisów `accepted`) · 1 wpis `submitted` · 1 wpis `returned` z komentarzem |
| konsultacje (suma z zaakceptowanych) | 37 |
| superwizje | 5 obecności / wymagane 6; zapisana na 1 nadchodzący termin |
| warsztat | NIE |
| warunki certyfikatu | courses 1/10 · internship 41,5/72 · supervision 5/6 · workshop NIE → `eligible: false` |
| dokumenty | 1 × `volunteer_agreement` wygenerowane |
| powiadomienia | 3, w tym 1 nieprzeczytane (`internship.returned`) |

## 4. Treści

10 kursów ścieżki (grupa `psychon`): kursy 1–3 pełne (po 5 lekcji z materiałem PDF
i czasem trwania), kursy 4–10 szkieletowe (2 lekcje); 1 kurs „zaproszony" poza
sekwencją (webinar, grupa `psychon`) dla filipa; bank pytań: po 10 pytań dla kursów
1–3 (4 odpowiedzi, 1 poprawna).

## 5. Liczniki pulpitu (H19) i raportu (H20) wynikające z powyższego

| Licznik | Wartość |
|---|---|
| uczestnicy (volunteer+student, active) | 3 |
| ukończenia programu | 1 (ola) |
| certyfikaty | 1 |
| kolejka: zgłoszenia `new` | 1 |
| kolejka: wpisy stażu do akceptacji | **2** (submitted marty + 1 seedowany dodatkowy) |
| kolejka: profile do decyzji | 0 (draft oli się nie liczy) |
| kolejka: pytania bez odpowiedzi | 1 |
| raport: suma godzin zaakceptowanych | 41,5 (marta) + 72 (ola) = **113,5** |
| raport: suma konsultacji | 37 + 64 (ola) = **101** |

Rozjazd między tym plikiem a seederem = błąd seedera (poprawia strażnik schematu),
nie kryteriów.
