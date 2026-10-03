# Pomiar starych ekranów deklaracji dostępności i dokumentów prawnych

Ścieżki starych plików względem `frontend/`; nowe pliki w tym katalogu.

## `/deklaracja-dostepnosci` — `app/deklaracja-dostepnosci/page.tsx` → `DeklaracjaDostepnosci.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| tytuł karty przeglądarki | app/deklaracja-dostepnosci/page.tsx:9 | `metadata` strony podglądu |
| nagłówek i opis (WCAG 2.1 AA) | app/deklaracja-dostepnosci/page.tsx:35–37 | `Heading stopien={1}` + `Text`, te same zdania |
| sekcja „Stan zgodności”: zdanie o częściowej zgodności | app/deklaracja-dostepnosci/page.tsx:40–47 | `Karta` + `h2`, to samo zdanie |
| cztery punkty pomiaru (nagłówki, kontrast, etykiety, klawiatura) | app/deklaracja-dostepnosci/page.tsx:48–83 | lista `ul`, te same zdania i liczby |
| „Ten pomiar nie obejmuje…” i „Pełna tabela audytu…” | app/deklaracja-dostepnosci/page.tsx:85–101 | drobny tekst, te same zdania |
| „Data sporządzenia deklaracji”: 2026-09-16, przegląd „[do uzupełnienia przez Fundację]” | app/deklaracja-dostepnosci/page.tsx:105–111 | `Karta` + `h2` |
| „Zgłaszanie problemów…”, kontakt `mailto:kontakt@niepodzielni.com`, zdanie o odpowiedziach | app/deklaracja-dostepnosci/page.tsx:115–131 | `Karta` + `h2` + `Link` |
| brak odnośnika do siebie w stopce | components/layout/PublicFooter.tsx (warunek trasy) | `RamaPubliczna bezDeklaracji` |

## `/dokumenty-prawne/[typ]` — `app/dokumenty-prawne/[typ]/page.tsx` → `DokumentPrawny.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| rodzaj spoza listy → „Nie znaleziono dokumentu”, zdanie, „Wróć na stronę główną” (`/`), bez żądania | app/dokumenty-prawne/[typ]/page.tsx:57, 108–114 | `jestZnanymTypemDokumentu()` — ten sam pomocnik |
| tytuł z `LEGAL_DOCUMENT_LABELS` | app/dokumenty-prawne/[typ]/page.tsx:121 | to samo |
| odczyt `fetchLegalDocument(typ)` | app/dokumenty-prawne/[typ]/page.tsx:74 | to samo |
| wynik związany z kluczem `typ#ponowienie` | app/dokumenty-prawne/[typ]/page.tsx:64 | to samo |
| „Wczytywanie dokumentu…” | app/dokumenty-prawne/[typ]/page.tsx:125 | `Wczytywanie` |
| „Wersja … · data” i akapity po pustej linii | app/dokumenty-prawne/[typ]/page.tsx:131–141 | `akapityTresci()` (`logika.ts`) + `formatujDate` |
| 404 → „Dokument nie został jeszcze opublikowany.” | app/dokumenty-prawne/[typ]/page.tsx:80, 147 | `Komunikat wariant="info"` |
| inny błąd → komunikat i „Spróbuj ponownie” | app/dokumenty-prawne/[typ]/page.tsx:87, 151–154 | `Komunikat` + przycisk |

## Różnice

- Data wersji przez wspólny formater nowego frontu (strefa warszawska) — format
  słowny ten sam („17 września 2026”), dawniej strefa przeglądarki.
- Kolumna czytelna (do 752 px) zamiast `max-w-3xl`; stopka jest częścią szablonu.
- Stan „nie znaleziono” ma stopkę i znak Fundacji (dawniej sama karta bez szablonu).
