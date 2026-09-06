## Why

Wolontariuszka podpisuje porozumienie wolontariackie i odbiera zaświadczenie o stażu — dziś
oba dokumenty powstają przez ręczne przepisywanie danych z profilu do szablonu w edytorze, co
jest pracochłonne i podatne na literówki w PESEL-u i adresie. Pakiet H14 (moduł M11, priorytet
P2, rozmiar S) zamyka tę lukę: dokument generuje się z danych, które uczestniczka już wprowadziła
w profilu, a jego treść zostaje zamrożona w snapshotcie, więc późniejsza zmiana adresu nie
podmienia podpisanego już porozumienia.

Teraz, bo starter niesie już wszystko, czego pakiet potrzebuje — tabelę `documents`, model
`Document`, `PdfService`, `Notify::send`, `AuditLog::record` i seed z gotowym `PW/2026/001`
dla `marta@demo.pl`. Zależności odbiorcze od H01 (komplet pól profilu) i H11 (72 h stażu) nie
blokują startu: pola profilu są w seedzie, a godziny czyta `ProgressAggregator`, nie endpoint H11.

## What Changes

- **Nowa lista dokumentów** — `GET /documents` zwraca dokumenty zalogowanego użytkownika
  (typ, numer, data wygenerowania, status podpisu) wraz z informacją, które typy może teraz
  wygenerować, a które są zablokowane i dlaczego.
- **Generowanie dokumentu** — `POST /documents/generate {type}` dla typów
  `volunteer_agreement` i `internship_certificate`. Renderuje PDF przez `PdfService`
  **synchronicznie** i odpowiada 201 z gotowym dokumentem oraz podpisanym linkiem do pobrania.
- **Bramka kompletności profilu** — brak któregokolwiek z wymaganych pól
  (`first_name`, `last_name`, `email`, `phone`, `pesel`, `address_street`, `address_city`,
  `address_zip`) → 422 `profile_incomplete` z listą brakujących pól w `errors`.
- **Bramka stażu** — `internship_certificate` dostępne dopiero po osiągnięciu progu
  `internship_hours_required` (72 h) z godzin **zaakceptowanych**, liczonych przez
  `ProgressAggregator`; poniżej progu → 422 `conditions_not_met`.
- **Snapshot danych** — treść dokumentu zapisuje się w `documents.data_snapshot` w chwili
  generowania; późniejsza edycja profilu nie zmienia ani snapshotu, ani wyrenderowanego pliku.
- **Numeracja per typ + edycja** — ciągła, nadawana w transakcji: `PW/{rok}/{NNN}` dla
  porozumienia, `ZS/{rok}/{NNN}` dla zaświadczenia.
- **Jeden dokument na typ i edycję** — powtórne `generate` tego samego typu → 409
  (patrz „Do rozstrzygnięcia" niżej).
- **Pobranie podpisanym wygasającym linkiem** — `GET /documents/{id}/download` pod
  `auth:sanctum` + `signed`; cudzy dokument po id → 404, wygasły lub zmanipulowany podpis → 403.
- **Powiadomienie i audyt** — `Notify::send(..., 'document.ready', ...)` z linkiem do
  `/panel/dokumenty` oraz `AuditLog::record(..., 'document.generated', ...)`, oba w tej samej
  transakcji co zapis dokumentu.
- **Ekran `#/panel/dokumenty`** — lista dokumentów z pobieraniem, kafle typów do wygenerowania,
  czytelny komunikat o brakujących polach profilu z linkiem do `/panel/profil`. UI po polsku.

## Capabilities

### New Capabilities

- `documents`: generowanie dokumentów z danych profilu (porozumienie wolontariackie,
  zaświadczenie o stażu) — warunki dostępności typu, kompletność profilu, snapshot danych,
  numeracja per typ i edycja, pobranie podpisanym wygasającym linkiem, powiadomienie i audyt.

### Modified Capabilities

Brak — H14 nie zmienia wymagań żadnej istniejącej zdolności. Pakiet czyta `users`
(pola profilu) i `internship_entries` (przez `ProgressAggregator`), ale niczego w nich nie
modyfikuje i nie zmienia kontraktu tras należących do H01 ani H11.

## Impact

**Backend**

- `backend/routes/api/h14.php` — jedyny plik tras dotykany przez pakiet (własność H14, §5.1).
- Nowy `app/Http/Controllers/Api/V1/DocumentController.php` + FormRequest, Resource, Policy.
- Nowy serwis domenowy generowania (kompletność profilu, warunki typu, numeracja, snapshot).
- Nowe widoki Blade szablonów dokumentów dla `PdfService::render`.
- Testy `tests/Feature/H14/…` + jednostkowe dla reguły kompletności i numeracji.
- **Bez migracji** — tabela `documents` istnieje w starterze i ma komplet potrzebnych kolumn
  (`data_snapshot`, `pdf_path`, `generated_at`, `signature_status`, unikat `edition_id+type+number`).
- **Bez nowych zależności** composer/npm — `PdfService` to stub startera zapisujący HTML.

**Frontend**

- Nowa strona `frontend/app/(uczestnik)/panel/dokumenty/page.tsx` + komponenty pakietu.
- Pozycja w rejestrze menu — **plik sztabu**, zgłoszenie zamiast PR (§5.1).
- Pobieranie przez `fetch` z Bearerem i blob, nie `<a href>` — token nie przechodzi w linku.

**Kontrakt i rejestry**

- Trasy `GET /documents`, `POST /documents/generate`, `GET /documents/{id}/download` są już
  w kontrakcie (karta H14) — nic nie wymyślamy.
- `document.ready` (§3.1) i `document.generated` (§3.2) są w rejestrach — używamy wprost.

**Do rozstrzygnięcia przez strażnika kontraktu (przed implementacją, SLA 30 min)**

1. Kod błędu `document_already_generated` dla 409 przy powtórnym generowaniu. Sama sytuacja
   mieści się w tabeli §1.1 („duplikat unikalny" → 409), ale slug nie jest jeszcze wypisany
   w kontrakcie. Fallback, jeśli strażnik odmówi nowego sluga: zwracamy 409 z `code`
   wskazanym przez strażnika, kształt odpowiedzi bez zmian.
2. Prefiksy numeracji `PW` / `ZS` — `PW/2026/001` jest już w seedzie demo, `ZS` proponujemy
   dla zaświadczenia o stażu. Prefiks to wartość domenowa, nie kształt HTTP — jeśli sztab
   ma inne oczekiwanie, zmiana jest jednolinijkowa.

**Świadomie poza zakresem**

Panel administracji dla dokumentów (karta H14 wymienia wyłącznie `#/panel/dokumenty`),
podpis elektroniczny (`signature_status` zostaje `none` dla dokumentów generowanych przez
uczestniczkę), realne renderowanie PDF (stub startera), unieważnianie dokumentów.
