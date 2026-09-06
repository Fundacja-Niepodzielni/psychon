## Why

Dwadzieścia jeden pakietów, pięć ról i dziesiątki tras — bez jednego wspólnego test-kitu
każdy zespół pisałby własny wariant „zaloguj jako rola X, sprawdź status" i ryzykował
rozjazd konwencji (różne fabryki, różne asercje kodu błędu). Pakiet H02 (moduł M2,
priorytet **P0**, rozmiar M) dostarcza dokładnie ten wspólny fundament: trait
`actingAsRole()` do użytku przez wszystkie kolejne pakiety oraz matrycę uprawnień jako
**jedną tabelę w kodzie**, do której każdy pakiet dopisuje własne trasy jednym wierszem.

Priorytet P0 wynika z tego, że to test-kit, z którego korzystają inne pakiety P0 — im
później wyląduje, tym więcej zespołów pisze tymczasowe własne warianty do wyrzucenia.
Rozmiar M, mimo pozornie wąskiego zakresu, wynika z konieczności pokrycia całej matrycy
ról × tras już istniejących w kodzie (H01, H16) oraz z frontowej części kryterium ★2,
która wymaga strażnika roli w komponentach klienckich (uzasadnienie w Impact niżej).

## What Changes

- **`actingAsRole()`** — trait `Tests\Concerns\ActsAsRole`, tworzy użytkownika z podaną
  rolą i loguje go przez Sanctum (`actingAs($user, 'sanctum')`); jedno wywołanie zamiast
  ręcznego `User::factory()->create(['role' => ...])` + `actingAs()` w każdym teście
  każdego pakietu.
- **Matryca uprawnień jako jedna tabela** — `PermissionMatrixTest::matrixRows()` zwraca
  wiersze (rola|gość × metoda × URI × oczekiwany status) dla wszystkich tras P0 już
  istniejących w kodzie (H01: `/me`, `/me/exports`; H16: `/notifications`,
  `/admin/emails`); jeden `#[DataProvider]` test wykonuje żądanie i sprawdza status oraz
  `error.code` dla 401/403. Dopisanie nowej trasy = jeden nowy wiersz.
- **Testy §5(a)-(f)** — `matrix_5a`…`matrix_5f` z matrycy uprawnień
  (`docs/system/03-role-i-uprawnienia.md` §5); `matrix_5d`/`matrix_5e`, zależne od
  pakietów H04 i H12 (jeszcze nieistniejących), są `skipped` z komentarzem odsyłającym do
  właściwego pakietu — nie czerwienią builda.
- **`EnsureRole` wzbogacony o `reason`** — odmowa 403 niesie teraz
  `reason: {required_roles, your_role}` zamiast samego `message`, zgodnie z kopertą błędu
  z kontraktu §1.
- **Wspólny ekran 403** — `Forbidden403` (frontend), renderuje `reason` z kontraktu
  (wymaganą rolę i rolę użytkownika po polsku).
- **Strażnik roli w komponentach klienckich** — `RequireRole`, pobiera `/me` i porównuje
  rolę z dozwoloną listą; przy odmowie renderuje `Forbidden403` zamiast treści panelu.
  Owinięty wokół `admin/layout.tsx` (`project_manager`/`super_admin`) i
  `prowacazy/layout.tsx` (`instructor`) — patrz „Świadome odstępstwo" w Impact.

## Capabilities

### New Capabilities

- `permission-matrix-testkit`: wspólny test-kit uprawnień (`actingAsRole`, jedna tabela
  matrycy, testy §5) do wielokrotnego użytku przez wszystkie pakiety H01–H21, plus
  wzbogacony `reason` na 403 i klientowy strażnik roli z ekranem odmowy dostępu.

### Modified Capabilities

Brak zmiany kontraktu HTTP żadnego innego pakietu — `EnsureRole` zyskuje dodatkowe pole w
istniejącej kopercie błędu (`reason`), nie zmienia kodu ani statusu odpowiedzi. H02 nie
dodaje własnych endpointów (`routes/api/h02.php` zostaje pustym stubem).

## Impact

**Backend**

- `backend/routes/api/h02.php` pozostaje pustym stubem — zakres pakietu to wyłącznie
  test-kit i nawigacja frontu, nie własne endpointy.
- Nowy `tests/Concerns/ActsAsRole.php` — dostępny dla wszystkich kolejnych pakietów.
- Nowy `tests/Feature/PermissionMatrix/PermissionMatrixTest.php` — jedna tabela,
  rozszerzana przez kolejne pakiety wierszami dla własnych tras.
- Zmieniony `app/Http/Middleware/EnsureRole.php` — dodanie `reason` do wyjątku 403 (plik
  startera, zmiana punktowa i wsteczna kompatybilna: dotychczasowe `message` zostaje).

**Frontend**

- Nowe `components/permissions/Forbidden403.tsx`, `components/permissions/RequireRole.tsx`.
- **Świadome odstępstwo od zasady „H02 nie modyfikuje plików innych pakietów"**:
  `app/(administracja)/admin/layout.tsx` i `app/(prowadzacy)/prowadzacy/layout.tsx` — pliki
  formalnie „staff-owned" wg `AGENTS.md`, bez własnego pakietu-właściciela — owinięte w
  `<RequireRole>` (4 linijki: import + owinięcie `{children}`). Uzasadnienie: token Bearer
  żyje w `localStorage`, nie w ciasteczku, więc żadna kontrola po stronie serwera
  (`middleware.ts`, `forbidden()` z Next 16) nie ma dostępu do roli — strażnik musi być
  komponentem klienckim owiniętym wokół treści panelu, inaczej kryterium ★2 („ręczny URL
  we froncie → ekran 403") jest niewykonalne. `panel/layout.tsx` (uczestnik) **nietknięty**
  — matryca §2 pokazuje, że niemal każda rola ma dostęp do sekcji „Kursy", więc blokowanie
  całego panelu uczestnika byłoby błędne.

**Kontrakt i rejestry**

- Nie wprowadza nowych tras, typów powiadomień ani slugów audytu — czysto testowo-
  infrastrukturalny pakiet.
- Rozbieżność dokumentów (świadoma decyzja): `docs/system/03-role-i-uprawnienia.md` §5(b)
  każe testować „dostęp do cudzych zwraca 403", ale kontrakt §1.1 (wyższy priorytet wg
  `AGENTS.md`) mówi, że pojedynczy cudzy zasób wskazany identyfikatorem → **404** (nie
  ujawniamy istnienia zasobu). `matrix_5b` asertuje rzeczywiste zachowanie (404) z
  komentarzem cytującym tę rozbieżność; `matrix_5c` pokrywa prawdziwe 403 (odmowa całej
  sekcji/trasy).

**Świadomie poza zakresem**

Trasy H05/H06/H10/H21 i innych pakietów P0 w matrycy — dopisywane jednowierszowo przez
same te pakiety, gdy wylądują na `main` (H02 nie może pokryć tras, które jeszcze nie
istnieją w kodzie). `matrix_5d`/`matrix_5e` — aktywowane, gdy powstaną odpowiednio H04 i
H12. Testy frontendowe (repo nie ma runnera JS) — zweryfikowane `npm run build` i
scenariuszem ręcznym udokumentowanym w `DEMO/H02.md`.
