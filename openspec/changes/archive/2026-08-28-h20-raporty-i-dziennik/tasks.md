## 1. Backend — raport edycji

- [x] 1.1 `GET /admin/report` — `data.summary` (przyjęte, aktywne, ukończone, suma i
  średnia godzin stażu, konsultacje łącznie, certyfikaty wydane) + `data.people`
  (zestawienie imienne)
- [x] 1.2 `active`/`completed`/`certificates_issued` wołają `DashboardSummary::build()`
  (H19) — równość z pulpitem gwarantowana przez wspólny kod
- [x] 1.3 `hours_accepted_total`/`consultations_total` liczone z `internship_entries`
  status `accepted`, identycznie jak w `SeedIntegrityTest`
- [x] 1.4 Rola `project_manager` lub `super_admin`; inne role → 403 `forbidden`; brak
  tokenu → 401
- [x] 1.5 `GET /admin/report/export.csv` — zestawienie imienne, wspólny helper `Csv`
  (BOM + `;`)

## 2. Backend — dziennik działań

- [x] 2.1 `GET /admin/audit` — filtry `action` (wyłącznie slug z rejestru kontraktu
  §3.2, `Rule::in`, spoza rejestru → 422 `validation_failed`), `user_id` (aktor),
  `from`/`to` (zakres `created_at`), paginacja
- [x] 2.2 `GET /admin/audit/export.csv` — te same filtry co lista, wspólny helper `Csv`
- [x] 2.3 Rola `project_manager` lub `super_admin`; inne role → 403; brak tokenu → 401
- [x] 2.4 Zero tras modyfikacji `/admin/audit/*` — żadna nie jest rejestrowana w
  `routes/api/h20.php`, więc PATCH/PUT/DELETE/POST pod `/admin/audit/{id}` zwraca
  naturalne 404 Laravela

## 3. Frontend

- [x] 3.1 `#/admin/raport` — kafelki podsumowania, tabela zestawienia imiennego,
  eksport CSV, przycisk „Drukuj" (`window.print()`), warianty `print:` (Tailwind) na
  elementach niepotrzebnych na wydruku
- [x] 3.2 `#/admin/dziennik` — filtry (zdarzenie z etykietami PL, ID osoby, zakres
  dat), tabela, paginacja, eksport CSV
- [x] 3.3 Wpisy menu administracji (`lib/menu/admin/h20-{raport,dziennik}.ts` +
  rejestracja w `index.ts`, wzorzec „jedna linia importu + jedna linia listy")
- [x] 3.4 Obie strony dziedziczą strażnik roli `RequireRole` (H02) przez
  `admin/layout.tsx` — ręczne wejście spoza roli administracyjnej pokazuje ekran 403

## 4. Testy i demo

- [x] 4.1 Pokrycie automatyczne: 15 testów / 62 asercje w `backend/tests/Feature/H20/`
  (`ReportTest`, `AuditTest`); pełny pakiet backendu 381 passed / 2 skipped po zmianie
- [x] 4.2 `DEMO/H20.md` udokumentowane: zakres, kryteria i dowody, scenariusz demo,
  świadome decyzje, wymuszona poprawka w cudzym pliku (H02)
- [ ] 4.3 Brak testów frontendu (jak w poprzednich pakietach — repo nie ma runnera JS w
  tym środowisku); ekrany zweryfikowane `npm run build` + ręcznym scenariuszem + CSV
  sprawdzone bajt po bajcie przez `curl` (BOM, separator, nagłówki, dane)

## 5. Poza zakresem tego pakietu

- [ ] 5.1 Rozstrzygnięcie przez strażnika kontraktu, czy `user_id` w filtrze dziennika
  powinien oznaczać aktora czy podmiot — obecna decyzja (aktor) udokumentowana w
  `design.md`; zmiana w razie innej decyzji jest lokalna do `AdminAuditQuery`
- [ ] 5.2 Ekran `#/admin/postepy` (zestawienie czterech filarów) — jawnie poza
  zakresem hackathonu (`01-pakiety-zadan.md`, „Czego nie robimy")
