## Context

Zob. `proposal.md` — sekcja „Why". Stan wyjściowy istotny dla podejścia:

- `routes/api/h13.php` jest pusty (same komentarze). Flaga `config('features.h13')`.
- Tabela `certificates` ma już wszystkie potrzebne kolumny (`number` unikalny,
  `verification_token` unikalny, `conditions_snapshot` json, `issued_at`,
  `pdf_path` nullable, `revoked_at` / `revoked_reason`). Migracje są **zamrożone** —
  ten pakiet nie zmienia schematu.
- `App\Support\ProgressAggregator::for()` (sygnatura zamrożona) zwraca
  `courses_done/total`, `hours_accepted` (string), `supervision_present`,
  `workshop_done` — to jedyne źródło liczb do warunków.
- `App\Support\PdfService::render(view, data)` to **stub**: renderuje Blade i
  zapisuje HTML pod `pdf/…`, zwraca ścieżkę. Kontrakt metody zostaje po
  hackathonie, zmienia się tylko implementacja (realny PDF).
- `App\Support\Settings::edition(key)` daje progi edycji
  (`internship_hours_required` = 72, `supervision_required_count` = 6).
- `config/public_routes.php` zawiera `api/v1/verify/*` — publiczne trasy H13 są
  już przepuszczone przez bramkę CI autoryzacji.
- Seed: `ola@demo.pl` ma wydany certyfikat `NP/2026/001`; nowe wydania w edycji
  2026 muszą kontynuować od `002`.
- Wzorzec współbieżnej numeracji jest w repo: `DemoPassTest` i (poza tą gałęzią)
  H10 liczą kolejny numer w transakcji z `lockForUpdate` + `max()` w PHP
  (Postgres zabrania `FOR UPDATE` z agregatem).

## Goals / Non-Goals

**Goals:**

- Jedno źródło stanu warunków dla trasy `GET /certificate/conditions` i dla
  bramki `POST /certificate/generate` — brak dwóch implementacji tej samej reguły.
- Wydanie certyfikatu atomowe: numer + rekord + snapshot + `program_completed_at`
  + audyt w jednej transakcji; render pliku poza transakcją.
- Publiczna weryfikacja nie ujawnia formatu numeru ani istnienia rekordu poza
  jednoznacznym „valid / revoked / nie znaleziono".

**Non-Goals:**

- Realny PDF (zostaje stub `PdfService`), realny kod kreskowy w druku.
- Unieważnianie certyfikatów (kontrakt §4) — obsługujemy tylko odczyt `status`.
- Ekran `#/admin/postepy` i zestawienie czterech filarów po stronie administracji
  (kontrakt §4).
- Zmiany w `ProgressAggregator`, `PdfService`, `EnsureAccessActive`.

## Decisions

### D1. Reguła warunków w jednej klasie pakietu

Nowa klasa `App\Support\H13\CertificateConditions` (kod pakietu, nie fasada
startera) buduje listę czterech warunków z `ProgressAggregator::for($user)` i
progów z `Settings::edition(...)`:

- `courses`: `courses_done` vs `courses_total`, `met` gdy równe i `courses_total > 0`
- `internship`: `hours_accepted` (string) vs `internship_hours_required` (string),
  `met` gdy `>=` po porównaniu numerycznym
- `supervision`: `supervision_present` vs `supervision_required_count`
- `workshop`: tylko `met` = `workshop_done`
- `eligible` = koniunkcja wszystkich `met`

Trasa `conditions` serializuje tę strukturę; `generate` woła `->eligible()` i
`->missing()`. **Alternatywa odrzucona:** liczenie w kontrolerze/FormRequeście —
rozjazd między ekranem a bramką przy pierwszej zmianie progu.

### D2. Wydanie jako zadanie w tle + transakcja numeracji

`POST /certificate/generate` waliduje eligibility, przy braku → `422
conditions_not_met` z `reason.missing`. Przy komplecie: dispatch
`GenerateCertificate($userId)` i odpowiedź `202` z lekką kopertą (status
`queued`). W testach `QUEUE_CONNECTION=sync` — zadanie wykona się w miejscu.

Zadanie:

1. `DB::transaction`:
   - `lockForUpdate` na `certificates` danej edycji, `max` numeru w PHP,
     kolejny = `max + 1`, format `NP/<rok edycji>/<3 cyfry>`;
   - jeżeli uczestnik ma już certyfikat w tej edycji → wyjście bez zmian
     (idempotencja, para `user_id`+`edition_id`);
   - utworzenie rekordu: `number`, `verification_token` (losowy, unikalny),
     `conditions_snapshot` (pełna struktura z D1 z chwili wydania), `issued_at`;
   - `users.program_completed_at = now()` jeśli puste;
   - `AuditLog::record($user, 'certificate.issued', $certificate, [...])` — fasada
     dołącza do otwartej transakcji.
2. Po commit: `pdf_path = PdfService::render('pdf.certificate', [...])`, zapis.

Backstopem numeracji jest unikat `certificates.number`; przy kolizji (rzadki
wyścig mimo locka) zadanie retry’uje. **Alternatywa odrzucona:** osobna sekwencja
DB per edycja — wymaga migracji (zamrożone).

### D3. Render PDF poza transakcją, `pdf_path` nullable

`PdfService::render` pisze na dysk (efekt uboczny) — trzymamy go za commitem, żeby
rollback nie zostawiał pliku-sieroty. Jeśli render padnie, rekord istnieje bez
`pdf_path`, `GET /certificate/download` zwraca 404 do czasu ponowienia zadania.
Akceptowalne na hackathon; zadanie jest retry’owalne.

### D4. Kod QR w widoku certyfikatu

Widok `resources/views/pdf/certificate.blade.php` zawiera **pełny adres
weryfikacji** (`/weryfikacja?token=<verification_token>`) jako czytelny odnośnik
oraz obraz QR jako **inline data-URI SVG** generowany minimalnym enkoderem
dołączonym jako kod pakietu w `App\Support\H13\` (nie zależność composer). Jeśli
sztab nie zgodzi się na wniesienie enkodera, wariant zapasowy: sam odnośnik
tekstowy + placeholder QR — kryterium „QR prowadzi do weryfikacji" domykane po
hackathonie razem z realnym `PdfService`. Zob. Open Questions.

### D5. Jednolita odpowiedź 404 weryfikacji

Trasy `GET /verify/{number}` i `GET /verify/qr/{token}` **nie** mają ograniczeń
`where(...)` na parametrze (regex 404 ujawniałby format i różnicowałby błąd).
Kontroler przyjmuje dowolny łańcuch, robi lookup i przy braku rzuca jeden
`ApiException(404, 'not_found', 'Nie znaleziono certyfikatu o podanym numerze.')`
— identycznie dla numeru nieznanego i źle sformatowanego. Bez `access.active`,
bez `auth`.

### D6. Bramki dostępu dla tras uczestnika

`conditions`, `generate`, `download`: `auth:sanctum` + `role:volunteer` +
`access.active` (funkcje programu, spójnie z H10). Trasy publiczne: bez żadnej z
tych bramek.

### D7. Ekrany

- `#/panel/certyfikat` — komponent kliencki: `GET /certificate/conditions`,
  lista czterech warunków (`ProgressBar`/`Badge`), przycisk „Wygeneruj certyfikat"
  aktywny tylko przy `eligible`; po `202` odpytanie warunków/statusu i pokazanie
  odnośnika do pobrania. Wpis w rejestrze menu uczestnika
  `lib/menu/participant/h13-certyfikat.ts` (dwie linie w `index.ts`).
- `#/weryfikacja` (root, publiczny) — pole numeru → `GET /verify/{number}` →
  karta wyniku lub komunikat 404.
- `#/certyfikat` (root, publiczny) — widok trafienia z parametru `?token=` lub
  `?number=` (wejście z QR).

## Risks / Trade-offs

- **Wyścig numeracji przy równoległym wydawaniu** → transakcja z `lockForUpdate`
  na wierszach edycji + unikat `number` jako twarda bariera + retry zadania. Test
  `--filter=ConcurrentCertificate` potwierdza ciąg bez dziur.
- **Render pliku pada po utworzeniu rekordu** → `pdf_path` nullable, download 404
  do ponowienia; zadanie retry’owalne. Nie blokuje `program_completed_at`.
- **Zależność odbiorcza od H04** (kryterium 5: `program_completed_at` zdejmuje
  limit) → nie blokuje implementacji; test wspólny H13+H04, wynik do obu
  `DEMO/HXX.md`.
- **Zgodność liczb z H18/H19/H20** → wszystkie czytają `ProgressAggregator`;
  ryzyko rozjazdu tylko jeśli H13 policzy warunki inaczej — dlatego D1.
- **Wniesienie enkodera QR** ociera się o zasadę „zero nowych zależności" (§4) —
  mitygacja: kod pakietu, nie composer; wariant zapasowy bez QR (D4).
- **Idempotencja wydania** przy podwójnym kliknięciu / równoległych żądaniach →
  sprawdzenie istnienia certyfikatu wewnątrz transakcji, para `user_id+edition_id`.

## Migration Plan

- Brak zmian schematu bazy, brak nowych zależności composer/npm.
- Wdrożenie: włączona flaga `features.h13`; niedokończone → flaga na `false`
  (trasy pakietu się nie rejestrują, ekrany chować za flagą po stronie menu).
- Rollback: `features.h13 = false`. Rekordy `certificates` z seeda pozostają
  nienaruszone; `program_completed_at` ustawione wydaniami zostaje (świadome —
  to stan absolwenta, nie artefakt techniczny).
- Seeder pakietu (zakres ID per pakiet) w rejestrze seederów — do potwierdzenia z
  strażnikiem schematu, czy `ola` w seedzie wystarcza jako stan demo.

## Open Questions

- **Enkoder QR**: czy sztab akceptuje wniesienie minimalnego enkodera QR jako kod
  pakietu (`app/Support/H13/`), czy na hackathon zostajemy przy odnośniku
  tekstowym w widoku stubu `PdfService`? Nie zmienia to specyfikacji ani podziału
  zadań — wpływa tylko na treść jednego widoku Blade.
- **Format numeru w błędnym wejściu weryfikacji**: przyjmujemy, że dowolny string
  niepasujący do żadnego rekordu → 404 z jednolitym komunikatem; nie wprowadzamy
  osobnej walidacji formatu (spójne z D5).
