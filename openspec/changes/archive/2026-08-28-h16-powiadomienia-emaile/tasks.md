Backfill — zadania odzwierciedlają pracę już wykonaną i scaloną do `main` (patrz
`DEMO/H16.md`), a nie plan do wykonania. Wszystkie pozycje są zamknięte.

## 1. Skrzynka powiadomień właściciela

- [x] 1.1 `GET /notifications` (`NotificationController@index`) — wyłącznie własne
  powiadomienia, sortowanie malejąco po `created_at`, paginacja (`per_page` 1–100,
  domyślnie 25), `meta.extra.unread` z osobnego zapytania
- [x] 1.2 `POST /notifications/{id}/read` (`whereNumber('id')`) — skanowanie po
  `user_id = auth()->id()`, idempotentne ustawienie `read_at`; brak dopasowania → 404
  `not_found`
- [x] 1.3 `POST /notifications/read-all` zarejestrowany przed `{id}/read`, żeby literalny
  segment nie został dopasowany jako `{id}`; aktualizuje wyłącznie nieprzeczytane
  powiadomienia wywołującego
- [x] 1.4 Test: `GET /notifications` zwraca tylko powiadomienia wywołującego z poprawnym
  licznikiem nieprzeczytanych
- [x] 1.5 Test: oznaczenie cudzego powiadomienia po `id` → 404 `not_found`
- [x] 1.6 Test: oznaczenie własnego powiadomienia ustawia `read_at`
- [x] 1.7 Test: `read-all` dotyka wyłącznie powiadomień wywołującego
- [x] 1.8 Test: brak tokenu → 401 `unauthenticated` na wszystkich trasach powiadomień

## 2. Szyna Notify::send i skrzynka e-maili

- [x] 2.1 Zweryfikowano zamrożoną sygnaturę `Notify::send` (starter) — jedna transakcja,
  jeden wiersz `notifications` + jeden wiersz `emails` (status zawsze `simulated`) na
  wywołanie
- [x] 2.2 `GET /admin/emails` (`Admin\EmailController@index`) — lista wszystkich e-maili,
  paginacja jak wyżej, bez `meta.extra`, dostęp ograniczony middleware'em
  `role:project_manager,super_admin`
- [x] 2.3 Test parametryzowany po całym rejestrze typów §3.1 (16 wariantów): każde
  wywołanie `Notify::send` tworzy powiadomienie + symulowany e-mail powiązany przez
  `related_type/related_id`
- [x] 2.4 Test: administracja (`project_manager`, `super_admin`) widzi skrzynkę e-maili
  z odbiorcą/tematem/treścią/statusem/czasem
- [x] 2.5 Test: rola `volunteer` → 403 `forbidden` na `GET /admin/emails`
- [x] 2.6 Test: brak tokenu → 401 `unauthenticated` na `GET /admin/emails`
- [x] 2.7 Wiersze macierzy uprawnień (H02, `PermissionMatrixTest`) pokrywające trasy H16,
  w tym udokumentowany wyjątek 404 (nie 403) dla cudzego powiadomienia po `id`

## 3. Frontend

- [x] 3.1 `frontend/components/notifications/NotificationBell.tsx` wpięty w
  `PanelShell.tsx` — odpytywanie co 30 s, licznik z limitem wyświetlania „9+”, zamykanie
  po kliknięciu poza/Escape
- [x] 3.2 Kliknięcie pozycji nawiguje pod `link` i oznacza jako przeczytane optymistycznie
  (fire-and-forget `POST .../read`, cichy fallback do kolejnego pollu)
- [x] 3.3 Przycisk „oznacz wszystkie jako przeczytane” (optymistyczny, z awaryjnym
  przeładowaniem przy błędzie)
- [x] 3.4 `frontend/app/(administracja)/admin/emails/page.tsx` — tabela
  odbiorca/temat/status/czas z paginacją klienta i modalem podglądu treści
  (`dangerouslySetInnerHTML` na już uciekanym `body_html`)
- [x] 3.5 Wpis menu administracji `frontend/lib/menu/admin/h16-emails.ts`
  („Skrzynka e-maili”, `/admin/emails`)

## 4. Dokumentacja i weryfikacja

- [x] 4.1 Pokrycie automatyczne: 13 testów w `tests/Feature/Notifications/` (`NotifySendTest`
  16 wariantów, `NotificationsEndpointTest` 5, `AdminEmailsTest` 4) plus wiersze H16
  w `PermissionMatrixTest`; pełny pakiet backendu zielony
- [x] 4.2 `DEMO/H16.md` udokumentowane: zakres, kryteria ★, scenariusz manualny (Marta →
  dzwonek → `internship.returned` → nawigacja i wyczyszczenie licznika; administracja →
  skrzynka e-maili → podgląd), odnotowana decyzja scalenia bez PR

## 5. Ten backfill (poza zakresem implementacji)

- [x] 5.1 Zbadano faktyczny kod scalony do `main` (trasy, kontrolery, szyna `Notify::send`,
  testy, `DEMO/H16.md`) jako źródło tej specyfikacji
- [x] 5.2 **Wymaga człowieka** — recenzja partnera/liaisona zgodnie z
  `docs/hackathon/06-workflow-pakietu-i-pr.md`, następnie synchronizacja do
  `openspec/specs/notification-inbox-emails` i archiwizacja zmiany
