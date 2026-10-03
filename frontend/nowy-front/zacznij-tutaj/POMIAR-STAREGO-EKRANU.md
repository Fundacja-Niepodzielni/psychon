# Pomiar starego ekranu „Zacznij tutaj”

Stary ekran: `app/(uczestnik)/panel/start/page.tsx` i `components/onboarding/OnboardingView.tsx`
(ścieżki względem `frontend/`). Nowy: `ZacznijTutaj.tsx`, `logika.ts`.

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Zacznij tutaj” | app/(uczestnik)/panel/start/page.tsx:23 | `PageHeader` (`h1`) w `ListTemplate` |
| odczyt `api("/onboarding")` razem z `api("/me")` (błąd `/me` → brak roli) | app/(uczestnik)/panel/start/page.tsx:49–50 | te same wywołania, ten sam `Promise.all` |
| wczytywanie „Wczytywanie ekranu startowego…” | app/(uczestnik)/panel/start/page.tsx:94 | `Wczytywanie` |
| błąd wczytania i „Spróbuj ponownie” | app/(uczestnik)/panel/start/page.tsx:60, 83–86 | `Komunikat` + przycisk, ten sam licznik prób |
| role administracji (`super_admin`, `project_manager`) | app/(uczestnik)/panel/start/page.tsx:21 | `czyAdministracja()` |
| „Edytuj treść” (administracja) | app/(uczestnik)/panel/start/page.tsx:117–123 | odnośnik „Edytuj treść” w nagłówku do `/admin/ekran-startowy` — patrz różnice |
| edytor treści w miejscu i „Zapisano treść ekranu.” | app/(uczestnik)/panel/start/page.tsx:99–111, 127 | ekran edycji `/admin/ekran-startowy` (nowy front: `nowy-front/ekran-startowy`) — patrz różnice |
| „Program ukończony {data}.” z odnośnikiem do `/panel/po-programie` | app/(uczestnik)/panel/start/page.tsx:129–137 | `Komunikat wariant="info"` + `Link` |
| „Ostatnia zmiana treści: {data}” (administracja) | app/(uczestnik)/panel/start/page.tsx:142–146 | to samo zdanie, `formatujDateICzas` |
| sekcja filmu: tytuł, ramka odtwarzacza (`title` = tytuł filmu), wyróżnione tło | components/onboarding/OnboardingView.tsx:9–19, 54 | `Karta ciepla` + `h2` + `iframe` z tym samym `allow` |
| reguła: tylko host `youtube.com` (i poddomeny) oraz `youtu.be` → odtwarzacz YouTube | components/onboarding/embed-url.ts:2–19 | `adresOsadzenia()` — test zgodności z `toEmbedUrl` wartość w wartość |
| brak filmu: podpis albo „Film pojawi się tutaj wkrótce.” | components/onboarding/OnboardingView.tsx:22–35 | to samo zdanie |
| podpis pod filmem, gdy jest film i podpis | components/onboarding/OnboardingView.tsx:56–58 | to samo |
| sekcje „program” i „oczekiwania” z łamaniem wierszy | components/onboarding/OnboardingView.tsx:61–72 | `Karta` + `h2` + tekst z `white-space: pre-line` |

## Różnice

- **Edycja treści**: stara strona otwierała edytor w miejscu (`OnboardingEditor`) i po
  zapisie pokazywała „Zapisano treść ekranu.”. Nowy ekran prowadzi administrację
  odnośnikiem na ekran edycji `/admin/ekran-startowy`, który w nowym froncie już
  istnieje (`nowy-front/ekran-startowy`, z podglądem, zapisem i komunikatem o zapisie).
  Powód: drugi edytor tej samej treści w innym miejscu oznaczałby dwie implementacje
  zapisu `PATCH /admin/onboarding`; edytor z `components/` jest zamrożony. Pytanie
  otwarte w raporcie gałęzi.
- Daty w formacie wspólnego formatera („30 września 2026, 20:50”) zamiast „30.09.2026, 20:50”.
- Ekran stoi na `ListTemplate` z `PageHeader` (okruszek i „Wstecz” poza nową ramką
  panelu) — jak pozostałe ekrany panelu nowego frontu; nie ma stopki stron publicznych.
