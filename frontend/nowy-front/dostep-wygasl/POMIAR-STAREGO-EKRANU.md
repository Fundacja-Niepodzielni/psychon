# Pomiar starego ekranu „Dostęp wygasł”

Stary ekran: `app/dostep-wygasl/page.tsx` (ścieżki względem `frontend/`). Nowy: `DostepWygasl.tsx`.

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| tytuł karty przeglądarki „Dostęp wygasł — Niepodzielni” | app/dostep-wygasl/page.tsx:6 | `metadata` strony podglądu |
| nagłówek „Twój dostęp do platformy wygasł” | app/dostep-wygasl/page.tsx:11 | `Heading stopien={1}` |
| etykieta stanu „Konto nieaktywne” | app/dostep-wygasl/page.tsx:14 | `Badge wariant="neutral"` |
| wyjaśnienie sześciomiesięcznego okresu i przedłużenia | app/dostep-wygasl/page.tsx:17–19 | `Text`, to samo zdanie |
| „Kontakt:” i odnośnik `mailto:kontakt@niepodzielni.com` | app/dostep-wygasl/page.tsx:22–28 | `Link` z tym samym adresem i napisem |
| znak Fundacji | components/templates/PublicPageTemplate.tsx (Logo) | `logo` ze strony podglądu |

## Różnice

- Stopka z odnośnikami (deklaracja, dokumenty prawne) jest częścią szablonu, a nie
  układu głównego — w treści (`main`) nadal jest dokładnie jeden odnośnik.
