## Context

Zob. `proposal.md` — „Why". Poniżej wyłącznie to, co kształtuje podejście techniczne.

Stan zastany, zweryfikowany w kodzie:

- `App\Http\Middleware\EnsureRole` (starter) istnieje i jest zarejestrowany jako alias
  `role:...`; rzuca `ApiException(403, 'forbidden', ...)` już przed zmianą H02 — pakiet
  dodaje wyłącznie `reason`, nie zmienia sygnatury middleware ani kodu/statusu.
  `App\Exceptions\ApiException` już obsługuje opcjonalny parametr `reason`.
  `docs/system/03-role-i-uprawnienia.md` (§1) dokumentuje, że nawigacja i strażnicy w
  przeglądarce **tylko poprawiają wygodę** — serwer odrzuca każde żądanie API spoza
  dozwolonej roli niezależnie od tego, czy front pokazuje panel czy ekran 403.
  Token Sanctum żyje w `localStorage` (decyzja startera, poza zakresem H02) — żadna
  kontrola po stronie serwera Next.js nie ma do niego dostępu.
- Tylko dwa pakiety mają scalone trasy w chwili pisania H02: H01 (`/me`, `/me/exports`) i
  H16 (`/notifications`, `/admin/emails`) — to jedyne trasy, które matryca może realnie
  pokryć „dziś"; reszta P0 (H05/H06/H10/H21…) dopisze się sama, gdy wyląduje.
  `admin/layout.tsx` i `prowadzacy/layout.tsx` istnieją już jako pliki startera bez
  własnego pakietu-właściciela.

Ograniczenia: `routes/api/h02.php` zostaje pustym stubem (H02 nie dodaje endpointów);
brak nowych zależności composer/npm; brak migracji; teksty UI po polsku.

## Goals / Non-Goals

**Goals:**

- Jedna tabela wierszy w kodzie jako jedyne źródło matrycy — dopisanie trasy przez
  kolejny pakiet to jeden nowy wiersz, zero zmian w reszcie testu.
- `actingAsRole()` jako współdzielony, stabilny interfejs, z którego pakiety P0+ mogą
  korzystać od pierwszego dnia bez czekania na H02.
- Odmowa dostępu jest spójna na obu warstwach: API zwraca `reason` z rolą wymaganą i
  posiadaną, front renderuje ten sam `reason` zamiast wymyślać własny komunikat.
- Rozbieżność między dokumentem ról a kontraktem API rozstrzygnięta jawnie, z testem po
  stronie zwycięskiego źródła (kontrakt), nie przemilczana.

**Non-Goals:**

- Pokrycie tras pakietów, które jeszcze nie istnieją w kodzie — matryca rośnie wraz z
  merge'ami innych pakietów, nie z góry.
- Automatyzacja testów frontendowych — repo nie ma runnera JS; weryfikacja przez
  `npm run build` i scenariusz ręczny.
- Zmiana zachowania `EnsureRole` dla ról uprawnionych — wyłącznie wzbogacenie ścieżki
  odmowy o dodatkowe pole.
- Blokowanie panelu uczestnika (`panel/layout.tsx`) — matryca §2 nie daje jednej wspólnej
  roli dla tej sekcji, więc globalny strażnik byłby błędny.

## Decisions

### D1. Matryca jako jedna metoda statyczna zwracająca tablicę wierszy, nie osobne testy per trasa

`PermissionMatrixTest::matrixRows()` generuje wiersze programowo (pętla po
`ROLES × trasy`), każdy wiersz opisuje rolę (albo `null` dla gościa), metodę, URI,
oczekiwany status i opcjonalnie `body`/`own` (zasób tworzony dla wykonawcy przed
żądaniem, np. własny eksport). Jeden `#[DataProvider]`-owy test (`test_matrix_row`)
wykonuje żądanie i asertuje status oraz, dla 401/403, `error.code`.

*Dlaczego:* kryterium 1 wprost wymaga „provider czyta wiersze z jednej tabeli w kodzie —
łatwo dopisywać". Gdyby każda trasa miała osobną metodę testową, dodanie trasy przez
kolejny pakiet wymagałoby napisania nowego testu (boilerplate, ryzyko niespójnej
asercji), zamiast jednego wiersza w istniejącej tabeli. *Alternatywa:* generowanie
matrycy z introspekcji `Route::getRoutes()` i middleware `role:` — odrzucona: część tras
(np. `own`-scoped) wymaga danych kontekstowych (utworzenia zasobu należącego do
wykonawcy), których nie da się wywnioskować z samej definicji trasy.

### D2. `own` jako deklaratywny znacznik zasobu wykonawcy, nie osobna ścieżka testu

Wiersze z kluczem `own` (np. `own: 'export'`) każą testowi przed właściwym żądaniem
utworzyć zasób należący do zalogowanego wykonawcy (`POST /me/exports`) i podstawić jego
`id` w URI. To samo dla `own: 'notification'` przez `Notify::send`.

*Dlaczego:* trasy typu `GET /me/exports/{id}` mają sens tylko z realnym, własnym `id` —
podstawienie stałej wartości dałoby fałszywe 404 niezależnie od uprawnień, maskując to,
co matryca ma sprawdzać. Mechanizm jest rozszerzalny: kolejny pakiet z zasobem
scoped-do-właściciela dodaje nowy przypadek `own` bez zmiany silnika testu.

### D3. Rozbieżność §5(b) vs kontrakt §1.1 rozstrzygnięta na korzyść kontraktu, z testem dokumentującym powód

`docs/system/03-role-i-uprawnienia.md` §5(b) każe testować „dostęp do cudzych zwraca
403". Kontrakt API §1.1 (wyższy priorytet wg `AGENTS.md` „Hard rules") mówi: pojedynczy
cudzy zasób wskazany identyfikatorem → **404**, żeby nie ujawniać istnienia zasobu.
`matrix_5b` asertuje rzeczywiste zachowanie (404 na `POST /notifications/{cudze_id}/read`)
z komentarzem w kodzie cytującym tę rozbieżność wprost; `matrix_5c` osobno pokrywa
prawdziwe 403 — odmowę całej sekcji/trasy (np. wolontariusz na `/admin/emails`), gdzie nie
chodzi o ukrywanie istnienia pojedynczego rekordu.

*Dlaczego nie zmienić dokumentu ról:* to nie jest decyzja H02 do podjęcia — dokument
systemowy jest poza zakresem pakietu; test dokumentuje rozstrzygnięcie i odsyła do
źródła, zamiast po cichu je ignorować.

### D4. `matrix_5d` / `matrix_5e` jako `skipped` z odwołaniem, nie pominięte milcząco

Testy zależne od tras H04 (dostęp czasowy) i H12 (superwizja/grupy), których jeszcze nie
ma w kodzie, są oznaczone `skipped` z komunikatem wskazującym pakiet blokujący, zamiast
być usunięte lub nienapisane.

*Dlaczego:* kryterium 3 wprost dopuszcza `skipped` „z odwołaniem do pakietu" — obecność
testu (nawet pominiętego) jest widocznym, żywym przypomnieniem do odznaczenia, gdy H04/H12
wylądują, zamiast zadania do ręcznego przypomnienia sobie później. Pominięcie nie
czerwieni builda (exit code 0 z `skipped` ≠ `failed`).

### D5. Strażnik roli jako komponent kliencki owijający layout, nie middleware Next.js

`<RequireRole allowedRoles={[...]}>` pobiera `/me` przy montowaniu, porównuje rolę z
dozwoloną listą i renderuje `Forbidden403` albo dzieci. Owinięty ręcznie wokół
`{children}` w `admin/layout.tsx` i `prowadzacy/layout.tsx` — cztery linijki na plik
(import + owinięcie).

*Dlaczego nie `middleware.ts` / `forbidden()` (Next 16):* token Sanctum żyje w
`localStorage`, nie w ciasteczku (decyzja startera) — middleware Next.js działa na
serwerze/edge i nie ma dostępu do `localStorage` przeglądarki, więc nie może odczytać
roli użytkownika. Kliencki strażnik jest jedynym miejscem, które może wykonać to
porównanie przed wyrenderowaniem treści panelu. *Świadome odstępstwo od reguły „H02 nie
modyfikuje plików innych pakietów":* oba layouty są „staff-owned" (starter), bez
własnego pakietu-właściciela, więc nie ma czyjegoś pakietu do naruszenia; zmiana jest
addytywna (owinięcie, nie przepisanie) i nie zmienia zachowania dla ról uprawnionych.
`panel/layout.tsx` (uczestnik) pozostaje nietknięty — matryca §2 pokazuje, że niemal
każda rola ma dostęp do jakiejś części tej sekcji.

### D6. Serwer jest jedynym źródłem prawdy o uprawnieniach; front tylko poprawia wygodę

`RequireRole` nie zastępuje autoryzacji serwerowej — każde żądanie API nadal przechodzi
przez `EnsureRole` niezależnie od tego, czy front zdążył pokazać ekran 403. Strażnik
kliencki eliminuje wyłącznie migotanie/błąd wizualny przy ręcznym wejściu pod chroniony
adres.

*Dlaczego:* to wprost zasada §1 dokumentu ról — dublowanie logiki uprawnień po stronie
klienta jako jedynego mechanizmu byłoby błędem bezpieczeństwa (token można zmodyfikować,
JS można wyłączyć). `RequireRole` odpytuje `/me`, czyli ten sam serwer, który egzekwuje
regułę — nie ma dwóch niezależnych źródeł prawdy.

## Risks / Trade-offs

- **Matryca pokrywa dziś tylko trasy H01/H16** → kryteria ★1/★2 są spełnione na tym, co
  istnieje w kodzie, ale nie gwarantują, że *przyszłe* trasy zostaną dopisane.
  *Mitygacja:* struktura jednowierszowa (D1) minimalizuje koszt dopisania na tyle, że
  włączenie do checklisty każdego pakietu (workflow §pakietu) jest realistyczne;
  odpowiedzialność za dopisanie własnej trasy spoczywa na właścicielu tej trasy, nie na
  H02 utrzymującym wszystko wstecznie.
- **`matrix_5d`/`matrix_5e` pozostają `skipped` do czasu H04/H12** → przez ten czas
  matryca nie weryfikuje realnie scenariuszy dostępu czasowego i superwizji.
  *Mitygacja:* `skipped` (nie usunięte) — widoczne w wyniku testów jako przypomnienie;
  odznaczenie jest pracą właścicieli H04/H12, nie kolejną rundą H02.
- **Odstępstwo od „nie modyfikuj cudzych plików"** (D5) → precedens mógłby skłonić
  kolejny pakiet do podobnej ingerencji bez tak mocnego uzasadnienia.
  *Mitygacja:* uzasadnienie (brak dostępu middleware do `localStorage`, brak
  alternatywnego właściciela pliku) jest udokumentowane wprost w `DEMO/H02.md` i tutaj;
  zmiana jest czteroliniowa i addytywna, nie przejęcie pliku.
- **Brak automatyzacji testów frontendowych** → `RequireRole`/`Forbidden403`
  zweryfikowane wyłącznie `npm run build` i scenariuszem ręcznym, nie testem
  automatycznym. *Mitygacja:* zgodne z resztą repo (brak runnera JS w innych pakietach
  również); ryzyko regresji ograniczone przez to, że komponenty są proste (fetch + branch
  na trzy stany).

## Migration Plan

Brak migracji bazy — pakiet nie dotyka schematu. Wdrożenie to zwykły merge; `EnsureRole`
jest plikiem startera współdzielonym przez wszystkie trasy chronione rolą, więc zmiana
(dodanie `reason`) obowiązuje natychmiast dla każdego pakietu używającego `role:...` —
wstecznie kompatybilna, bo dotychczasowe pole `message` pozostaje bez zmian. Rollback:
rewert commita H02 przywraca poprzedni kształt wyjątku 403 bez efektów ubocznych dla
danych (pakiet nic nie zapisuje do bazy).
