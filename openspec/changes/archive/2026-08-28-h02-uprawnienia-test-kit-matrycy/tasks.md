## 1. Przygotowanie

- [x] 1.1 Przeczytać `docs/system/03-role-i-uprawnienia.md` §2 (uprawnienia) i §5
      (wymagane testy) oraz `docs/hackathon/02-kontrakt-api.md` §1.1 (tabela decyzyjna
      kodów)
- [x] 1.2 Zidentyfikować trasy już scalone w kodzie do pokrycia matrycą: H01 (`/me`,
      `/me/exports`), H16 (`/notifications`, `/admin/emails`) — reszta P0 nie istnieje
      jeszcze na `main`
- [x] 1.3 Rozpoznać rozbieżność §5(b) vs kontrakt §1.1 (cudzy zasób: 403 wg dokumentu ról
      vs 404 wg kontraktu) i rozstrzygnąć na korzyść kontraktu (D3)
- [x] 1.4 Założyć `DEMO/H02.md` z sekcjami: co działa, kryteria akceptacji, świadome
      odstępstwo, rozbieżność dokumentów, testy/lint/build, pliki, braki, DoD

## 2. Test-kit współdzielony

- [x] 2.1 Napisać `Tests\Concerns\ActsAsRole::actingAsRole(role, attributes = [])` —
      tworzy użytkownika z rolą, loguje przez Sanctum, zwraca użytkownika
- [x] 2.2 Napisać `PermissionMatrixTest::matrixRows()` — pętla po pięciu rolach ×
      trasach H01/H16, plus wiersze gościa (401 dla każdej trasy); wiersze z `own`
      (D2) dla zasobów scoped-do-właściciela (`/me/exports/{id}`,
      `/notifications/{id}/read`)
- [x] 2.3 Napisać `test_matrix_row` — jeden `#[DataProvider]`-owy test wykonujący
      żądanie i asertujący status oraz, dla 401/403, `error.code`
      (`unauthenticated` / `forbidden`)
- [x] 2.4 Test kryterium 1: `--filter=PermissionMatrix` ≥40 asercji na trasach P0,
      wszystkie zielone (finalnie: 70 asercji, 50 testów, 2 skip)

## 3. Testy §5(a)-(f)

- [x] 3.1 Napisać `matrix_5a` — dostęp własny (rola ma dostęp do własnego zasobu)
- [x] 3.2 Napisać `matrix_5b` — cudzy zasób wskazany identyfikatorem → 404 `not_found`,
      z komentarzem cytującym rozbieżność §5(b) vs kontrakt §1.1 (D3)
- [x] 3.3 Napisać `matrix_5c` — rola bez dostępu do całej sekcji/trasy → 403 `forbidden`
      (wolontariusz na `/admin/emails`)
- [x] 3.4 Oznaczyć `matrix_5d` (zależne od H04) i `matrix_5e` (zależne od H12) jako
      `skipped` z komentarzem odsyłającym do właściwego pakietu (D4)
- [x] 3.5 Napisać `matrix_5f`
- [x] 3.6 Test kryterium 3: `matrix_5a`, `matrix_5b`, `matrix_5c`, `matrix_5f` zielone;
      `matrix_5d`/`matrix_5e` `skipped`, exit code 0

## 4. `EnsureRole` — wzbogacony `reason`

- [x] 4.1 Dodać do `App\Http\Middleware\EnsureRole` pole `reason:
      {required_roles, your_role}` w wyjątku 403, bez zmiany kodu/statusu ani
      istniejącego pola `message`
- [x] 4.2 Test: 403 z `EnsureRole` zawiera `error.reason.required_roles` (lista ról z
      middleware) i `error.reason.your_role` (rola wykonawcy)

## 5. Frontend — wspólny ekran 403 i strażnik roli

- [x] 5.1 Przeczytać właściwy przewodnik w `frontend/node_modules/next/dist/docs/`
      przed pisaniem kodu Next.js 16 (@frontend/AGENTS.md)
- [x] 5.2 Zbudować `components/permissions/Forbidden403.tsx` — renderuje `reason`
      (`required_roles`, `your_role`) po polsku, na komponentach `components/ui`
- [x] 5.3 Zbudować `components/permissions/RequireRole.tsx` — pobiera `/me` przy
      montowaniu, porównuje rolę z `allowedRoles`, renderuje `Forbidden403` albo
      dzieci; stan `loading`/`error` obsłużony (D6 — serwer, nie front, jest źródłem
      prawdy)
- [x] 5.4 Owinąć `{children}` w `<RequireRole allowedRoles={["project_manager",
      "super_admin"]}>` w `app/(administracja)/admin/layout.tsx` (odstępstwo
      udokumentowane w D5/proposal)
- [x] 5.5 Owinąć `{children}` w `<RequireRole allowedRoles={["instructor"]}>` w
      `app/(prowadzacy)/prowadzacy/layout.tsx`
- [x] 5.6 Potwierdzić, że `panel/layout.tsx` (uczestnik) pozostaje nietknięty —
      matryca §2 nie daje jednej wspólnej roli dla tej sekcji

## 6. Odbiór

- [x] 6.1 `docker compose exec app php artisan test --filter=PermissionMatrix` — 50
      passed, 2 skipped, 70 asercji, exit code 0
- [x] 6.2 `docker compose exec app php artisan test` — pełny pakiet backendu: 115
      passed, 2 skipped, 517 asercji
- [x] 6.3 `./vendor/bin/pint --test` na plikach pakietu — PASS (usterki stylu w
      plikach H01 poza zakresem, nietknięte)
- [x] 6.4 `npm run lint` i `npm run build` — czysto, wszystkie trasy zarejestrowane
- [x] 6.5 Scenariusz ręczny: `marta@demo.pl` → ręczny URL `/admin` i `/prowadzacy` →
      ekran „Brak dostępu" z rolą wymaganą i posiadaną; `admin@demo.pl` → `/admin`
      ładuje się normalnie; `joanna@demo.pl` → `/prowadzacy` ładuje się normalnie
- [x] 6.6 Uzupełnić `DEMO/H02.md` o wynik testów, scenariusz ręczny i listę świadomych
      braków (pokrycie tylko tras H01/H16, `matrix_5d`/`matrix_5e` skipped, brak
      testów frontendowych)
- [x] 6.7 Otworzyć PR z gałęzi `pakiet/H02-uprawnienia`; przegląd partnerski → przegląd
      łącznika → merge przez sztab (decyzja o scaleniu do `main` należy do właściciela
      repo, nie tego pakietu) — **wymaga potwierdzenia użytkownika** (push + PR to
      akcje z wymaganą jawną zgodą)
