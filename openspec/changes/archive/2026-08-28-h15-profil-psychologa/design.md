## Context

Zob. `proposal.md` → „Why". Stan wyjściowy istotny dla podejścia:

- `routes/api/h15.php` jest pusty (same komentarze). Flaga
  `config('features.h15')` jest już `true`.
- Migracje `psychologist_profiles` i `profile_documents` istnieją i mają
  wszystkie potrzebne kolumny (`status`, `return_reason`, `decided_by`,
  `decided_at`, `published_at`); migracje są **zamrożone** — ten pakiet nie
  zmienia schematu.
- `consents` istnieje z `user_id`, `type`, `document_version`, `granted_at`,
  `withdrawn_at` — insert przy udzieleniu, `withdrawn_at` ustawiane przy
  wycofaniu (nigdy literalny `DELETE`).
- `sensitive_access_log` istnieje (`viewer_id`, `file_type`, `file_id`,
  `viewed_at`) i ma gotowy model `App\Models\SensitiveAccessLogEntry`, ale
  **żaden pakiet jeszcze go nie zapisuje** (H03 — jedyny inny konsument z
  kontraktu — też nieodebrany). H15 jest pierwszym realnym użyciem.
- Wzorzec administracyjnej kolejki + decyzji z audytem/powiadomieniem i
  ochroną `403 entry_locked` przed powtórną decyzją jest już w repo:
  `App\Http\Controllers\Api\V1\H11\AdminInternshipController` (`role:
  project_manager,super_admin`, `lockForUpdate`, `AuditLog::record`,
  `Notify::send`).
- Wzorzec podpisanych, wygasających linków do plików chronionych jest już w
  repo: `App\Http\Resources\DocumentResource::download_url` przez
  `URL::temporarySignedRoute`, konsumowany przez `signed`-middleware trasę w
  `DocumentController::download` (H14). Storage: `Storage::disk('local')`.
- `AuditLog::record` i `Notify::send` (`App\Support`) mają zamrożone sygnatury
  i nie walidują slugów względem rejestru w kodzie — zgodność z rejestrem
  kontraktu §3.1/§3.2 jest konwencją pilnowaną przez review, nie przez typy.
- Seed: `ola@demo.pl` — absolwentka (`program_completed_at` ustawione),
  profil `draft` gotowy do złożenia. `opiekun@demo.pl` (`project_manager`) i
  `admin@demo.pl` (`super_admin`) to konta do testowania panelu administracji.

## Goals / Non-Goals

**Goals:**

- Jedna reguła kwalifikowalności (`program_completed_at !== null`) czytana
  identycznie przez ekran „czego brakuje" (`GET`) i przez bramki zapisu
  (`PATCH`, `submit`, `documents`) — brak dwóch implementacji tej samej
  reguły.
- Kompletność wniosku przy złożeniu i decyzje administracyjne jako operacje
  atomowe (transakcja: zmiana statusu + audyt + powiadomienie), spójnie z
  wzorcem H11.
- Każdy dostęp administracji do załącznika zostawia dokładnie jeden wpis w
  `sensitive_access_log` — bez wyjątków, także przy wielokrotnym pobraniu tego
  samego pliku.

**Non-Goals:**

- Przejście do statusu `published` — brak trasy w tym pakiecie (decyzja
  użytkownika; H15 nie definiuje żadnej ścieżki API do tego stanu na
  hackathon).
- Realne szyfrowanie plików at-rest — MVP korzysta z tego samego lokalnego
  dysku co H14 (`Storage::disk('local')`), bez warstwy szyfrowania (patrz Open
  Questions).
- Integracja z zewnętrzną bazą profili (`external_id`, `sync_status`) —
  kontrakt §4, faza 2.

## Decisions

### D1. Kwalifikowalność jako jedna metoda na modelu `User`, nie osobna usługa

W przeciwieństwie do H13 (cztery filary z `ProgressAggregator`),
kwalifikowalność H15 to pojedynczy warunek: `$user->program_completed_at !==
null`. Nie tworzymy osobnej klasy w stylu `CertificateConditions` — kontroler
i `FormRequest`y odwołują się bezpośrednio do tego pola. **Alternatywa
odrzucona:** dedykowany `App\Support\H15\ProfileEligibility` — nieuzasadniona
złożoność dla jednowarunkowej reguły; jeśli reguła urośnie po hackathonie,
wydzielenie jest trywialne.

### D2. `GET` zawsze `200`, zapis zawsze bramkowany `profile_not_eligible`

Zgodnie z M12.1 („wcześniej ekran wyjaśniający, czego brakuje") `GET
/psychologist-profile` nigdy nie zwraca `403` z powodu kwalifikowalności —
zwraca `eligible: false` i (dla wniosku nieistniejącego jeszcze w bazie)
domyślny szkielet `draft`. Każda operacja zapisu (`PATCH`, `submit`,
`documents`) sprawdza `eligible` jako pierwszy krok i zwraca
`403 profile_not_eligible` przed jakąkolwiek inną walidacją. **Alternatywa
odrzucona:** `404` na `GET` przed ukończeniem programu — nie realizuje
wymagania ekranu wyjaśniającego z M12.1.

### D3. Kompletność wniosku liczona w `FormRequest` akcji `submit`

`SubmitPsychologistProfileRequest` (albo logika w kontrolerze — do ustalenia
przy implementacji, nieistotne dla specyfikacji) sprawdza w jednym miejscu:
`specializations`, `approach`, `city` niepuste, co najmniej jeden załącznik
`dyplom`, zgoda na publikację udzielona. Brak dowolnego elementu → `422
profile_incomplete` z `reason.missing` (lista kluczy, wzorzec z `course_locked`
§1.1 kontraktu). **Alternatywa odrzucona:** oddzielne kody błędu per brakujące
pole — kontrakt nie przewiduje takiej granulacji dla tej klasy błędu (por.
`conditions_not_met` w H13, jeden kod + `reason`).

### D4. Zgoda na publikację jako rekord `consents` typu `publikacja_profilu`

Udzielenie zgody następuje w ramach `submit` (pole `publication_consent` w
żądaniu, walidowane jako wymagane `true` gdy kompletujemy wniosek) — insert do
`consents` z `granted_at = now()`. Wycofanie (`POST .../consent/withdraw`)
ustawia `withdrawn_at` na najnowszym aktywnym rekordzie tego typu dla
użytkownika. Historia zgód nigdy nie jest nadpisywana ani kasowana — spójne z
komentarzem w migracji i `docs/system/06-wymagania-niefunkcjonalne.md` §2.

### D5. Podpisane pobranie załącznika + log wglądu w jednej trasie

`GET /admin/profiles/{id}/documents/{docId}` to nazwana trasa za middleware
`signed`, generowana wyłącznie jako `download_url` w zasobie
`GET /admin/profiles/{id}` (mirror `DocumentResource::download_url` z H14).
Log w `sensitive_access_log` zapisujemy **w kontrolerze pobrania**, nie przy
generowaniu linku — link może wygasnąć nieużyty, a kryterium ★2 wymaga wpisu
przy faktycznym wglądzie. Każde użycie linku (także powtórne w oknie
ważności) zapisuje nowy wpis — prostsza, bezpieczniejsza reguła audytowa niż
deduplikacja. **Alternatywa odrzucona:** log przy generowaniu URL — nie
odzwierciedla rzeczywistego wglądu (link mógłby nigdy nie zostać otwarty).
Ten sam handler zapisuje też audyt `sensitive.viewed` (rejestr §3.2 —
odkryte podczas implementacji: slug był już przypisany H03/H15, pominięty w
pierwszej wersji tego dokumentu; poprawka nie zmienia kształtu API).

### D6. Decyzje administracji — dokładny mirror wzorca H11

`AdminProfileController::accept/return` odtwarza strukturę
`AdminInternshipController`: `lockForUpdate` w transakcji, strażnik
`assertSubmitted()` rzucający `404 not_found` (brak wniosku) albo
`403 entry_locked` (zły status), `AuditLog::record` i `Notify::send` w tej
samej transakcji. Ujednolica kod między pakietami o tym samym kształcie i
ułatwia review liaisona, który zna już ten wzorzec z H11.

### D7. Wycofanie zgody — nowa trasa POST na pod-zasobie, zgodnie z regułą nazewnictwa kontraktu

Kontrakt §1 nakazuje akcje domenowe jako `POST` na pod-zasobie i wymienia
zamknięty zbiór wyjątków (`/me`, `/admin/edition`, `PATCH .../attendance`,
`PATCH .../reorder`). `POST /psychologist-profile/consent/withdraw` **nie
jest nowym wyjątkiem** — to zwykłe zastosowanie już obowiązującej reguły
(akcja jako `POST` na pod-zasobie `consent`), więc nie wymaga zgody strażnika
co do samego kształtu trasy. Wymaga jej natomiast nowy slug rejestru — patrz
Open Questions.

## Risks / Trade-offs

- **Brak zarejestrowanego typu audytu/powiadomienia dla wycofania zgody** →
  blokuje wyłącznie `Notify::send` przy wycofaniu; status `withdrawn` i
  zapis `withdrawn_at` działają niezależnie od odpowiedzi strażnika (D7,
  fallback: kolejka administracyjna `?status=withdrawn`). Zgłoszenie idzie
  równolegle z resztą implementacji, SLA 30 min.
- **`H15` jest pierwszym pisarzem do `sensitive_access_log`** → brak
  istniejącego testu regresyjnego do skopiowania; mitygacja: nowy test
  feature asercjący dokładnie jeden wpis per pobranie (wymóg ★2 pakietu).
- **Brak realnego szyfrowania at-rest** dla `profile_documents` mimo że
  `docs/system/04` tego wymaga → mitygacja: ten sam wzorzec co H14
  (`Storage::disk('local')`), traktowane jako świadome uproszczenie
  hackathonowe równorzędne z brakiem realnego PDF w H13 (D4 tamtego
  pakietu); do potwierdzenia przez sztab.
- **Zależność od H13 (`program_completed_at`)** → H13 jest `DONE`, ryzyko
  niskie; test H15 na koncie `ola@demo.pl` weryfikuje zgodność za jednym
  zamachem.
- **Wyścig przy równoległym `accept`/`return` tego samego wniosku** →
  `lockForUpdate` + strażnik statusu w transakcji (D6), analogicznie do H11.

## Migration Plan

- Brak zmian schematu bazy, brak nowych zależności composer/npm.
- Flaga `features.h15` jest już `true` — wdrożenie to wyłącznie rejestracja
  tras; nie trzeba jej włączać osobno. Cofnięcie: `features.h15 = false`
  (trasy H15 przestają się rejestrować).
- Rollback nie narusza seeda: `ola@demo.pl` pozostaje w stanie `draft` do
  czasu realnego złożenia wniosku przez API albo testy.

## Open Questions

- **Rejestr powiadomień/audytu dla wycofania zgody**: zgłoszenie do strażnika
  kontraktu o nowy slug `profile.withdrawn` (jeden slug, użyty zarówno w
  §3.1, jak i §3.2 — wzorzec `internship.accepted`). Do czasu odpowiedzi
  implementacja korzysta z fallbacku D7/Risks (kolejka administracyjna, bez
  `Notify::send`); po odpowiedzi wystarczy dopisać jedno wywołanie
  `Notify::send` — nie zmienia to specyfikacji ani podziału zadań.
- **Szyfrowanie załączników at-rest**: czy sztab akceptuje na hackathon ten
  sam nieszyfrowany lokalny dysk co H14, czy wymaga minimalnej warstwy
  szyfrowania w tym pakiecie? Nie zmienia specyfikacji (zachowanie API jest
  identyczne w obu wariantach) — wpływa wyłącznie na implementację zapisu
  pliku w kontrolerze uploadu.
