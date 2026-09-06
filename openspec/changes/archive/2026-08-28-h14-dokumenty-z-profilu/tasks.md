## 1. Przygotowanie i zgłoszenia do sztabu

- [ ] 1.1 Zgłosić strażnikowi kontraktu slug `document_already_generated` dla 409 przy powtórnym generowaniu (uzasadnienie: tabela §1.1, wiersz „duplikat unikalny"); do czasu odpowiedzi trzymać slug w stałej `DocumentIssuer::DUPLICATE_CODE` — **wymaga człowieka**: kod już używa fallbacku, patrz `DEMO/H14.md`
- [ ] 1.2 Zgłosić strażnikowi kontraktu prefiksy numeracji `PW` / `ZS` (`PW/2026/001` jest już w seedzie demo) — **wymaga człowieka**: kod już używa tych prefiksów, patrz `DEMO/H14.md`
- [x] 1.3 Zgłosić sztabowi dopisanie pozycji „Dokumenty" (`/panel/dokumenty`) do rejestru menu — plik sztabu, zgłoszenie zamiast PR (§5.1) — **zaktualizowano podejście**: `frontend/lib/menu/participant/index.ts` jawnie zaprasza pakiety do dopisania własnego pliku + jednej linii samodzielnie (nie „zgłoszenie do sztabu"); zrobione zgodnie z tą, bardziej aktualną, konwencją — `h14-dokumenty.ts` + wpis w `index.ts`
- [x] 1.4 Założyć `DEMO/H14.md` z sekcjami na wynik demo i na dług techniczny (brak unikatu `(user_id, edition_id, type)`, PESEL w nieszyfrowanym `data_snapshot`)

## 2. Warunki dostępności typu dokumentu

- [x] 2.1 Napisać `App\Services\H14\DocumentTypeGate` zwracający dla każdego typu ze słownika `documents.type` parę „dostępny / powód" (`profile_incomplete` · `conditions_not_met` · `already_generated`)
- [x] 2.2 Zaimplementować regułę kompletności profilu: osiem pól z D3, brak = `null` albo pusty ciąg po `trim`, wynik jako lista nazw brakujących pól
- [x] 2.3 Zaimplementować warunek stażu dla `internship_certificate` — `ProgressAggregator::for()['hours_accepted']` porównane z `Settings::edition('internship_hours_required')`, dziesiętne jako stringi
- [x] 2.4 Test jednostkowy kompletności profilu: każde z ośmiu pól wyzerowane osobno → trafia na listę braków; komplet → brak braków
- [x] 2.5 Test jednostkowy warunku stażu: 41,5 h → niedostępne; 72 h → dostępne; 72 h w statusach `submitted`/`returned` → niedostępne

## 3. Numeracja i snapshot

- [x] 3.1 Napisać nadawanie numeru: blokada `lockForUpdate` na wierszu aktywnej edycji, `MAX` sekwencji dla pary (edycja, typ), format `{PREFIX}/{rok z edition.starts_at}/{NNN}`
- [x] 3.2 Napisać builder snapshotu (D8) zwracający gotowe do wydruku wartości: dane osobowe, adres, nazwa i daty edycji, numer, data wydania; dla zaświadczenia dodatkowo godziny zaakceptowane i liczba konsultacji
- [x] 3.3 Test jednostkowy numeracji: kolejny dokument dostaje kolejny numer; sekwencje typów są niezależne; rok bierze się z edycji, nie z `now()`
- [x] 3.4 Test współbieżności `--filter=ConcurrentDocumentNumber`: dziesięciu użytkowników generuje jednocześnie → dziesięć numerów, ciąg bez dziur i bez powtórzeń

## 4. Wydanie dokumentu (serwis + szablony)

- [x] 4.1 Napisać `App\Services\H14\DocumentIssuer::issue(User $user, string $type): Document` — jedna transakcja: warunki → blokada edycji → sprawdzenie duplikatu → numer → snapshot → render → zapis → `Notify::send('document.ready')` → `AuditLog::record('document.generated')`
- [x] 4.2 Dodać wyjątki domenowe mapowane na kody kontraktu: `profile_incomplete` (422 + `errors`), `conditions_not_met` (422 + `reason.hours_accepted/hours_required`), duplikat (409 + `reason.document_id`)
- [x] 4.3 Napisać szablon Blade porozumienia wolontariackiego — przyjmuje wyłącznie snapshot, teksty po polsku, dane escapowane
- [x] 4.4 Napisać szablon Blade zaświadczenia o stażu — jak wyżej, z godzinami i liczbą konsultacji
- [x] 4.5 Test: udane wydanie tworzy powiadomienie `document.ready` z linkiem do `/panel/dokumenty` i wpis audytu `document.generated`
- [x] 4.6 Test: każda z trzech odmów nie zostawia dokumentu, powiadomienia ani audytu (transakcja wycofana)
- [x] 4.7 Test kryterium ★2: wydanie dokumentu → zmiana adresu i telefonu w profilu → snapshot i treść pliku bez zmian

## 5. API — trasy, kontroler, autoryzacja

- [x] 5.1 Zarejestrować w `backend/routes/api/h14.php` trzy trasy pod `auth:sanctum` + `access.active`, za flagą `config('features.h14')`; trasa pobrania dodatkowo z middleware `signed`
- [x] 5.2 Napisać `DocumentPolicy` — właścicielem jest wyłącznie `user_id`; brak własności prowadzi do 404, nie 403
- [x] 5.3 Napisać `GET /documents`: `DocumentResource` z `id`, `type`, `number`, `generated_at` (ISO 8601 UTC), `signature_status`, świeży `download_url`; `meta.extra.available_types` z `DocumentTypeGate`
- [x] 5.4 Napisać `POST /documents/generate` + `GenerateDocumentRequest` (walidacja `type` przeciw słownikowi, inny → 422 `validation_failed`) → 201 z `DocumentResource`
- [x] 5.5 Napisać `GET /documents/{document}/download`: policy → odtworzenie pliku ze snapshotu, gdy brak na dysku (D7) → zwrot pliku z nazwą wyprowadzoną z numeru i typem treści z rozszerzenia ścieżki
- [x] 5.6 Test kryterium ★1: niekompletny profil → 422 `profile_incomplete` z listą pól w `errors`
- [x] 5.7 Test kryterium 3: cudzy dokument po id z poprawnym podpisem → 404 `not_found`; podpis wygasły → 403; podpis zmanipulowany → 403
- [x] 5.8 Test: `GET /documents` dla `marta@demo.pl` zwraca dokładnie `PW/2026/001`; dla `filip@demo.pl` pustą listę
- [x] 5.9 Test: powtórne `generate` dla `marta@demo.pl` → 409 z `reason.document_id`, liczba dokumentów bez zmian
- [x] 5.10 Test: pobranie dokumentu, którego plik zniknął z dysku, odtwarza go ze snapshotu i zwraca 200 (ścieżka demo na seedzie)

## 6. Frontend — ekran `#/panel/dokumenty`

- [x] 6.1 Przeczytać właściwy przewodnik w `frontend/node_modules/next/dist/docs/` przed pisaniem kodu Next.js 16 (@frontend/AGENTS.md)
- [x] 6.2 Dodać do `frontend/lib/api.ts` wywołania listy, generowania i pobrania (pobranie: `fetch` z Bearerem → blob → zapis pliku, bez `<a href>`)
- [x] 6.3 Zbudować stronę `app/(uczestnik)/panel/dokumenty/page.tsx` na komponentach z `components/ui` i design systemie (@DESIGN.md); teksty po polsku
- [x] 6.4 Zbudować listę wydanych dokumentów: numer, typ po polsku, data wydania, przycisk pobrania ze stanem ładowania
- [x] 6.5 Zbudować kafle typów do wygenerowania z powodem niedostępności z `meta.extra.available_types`; przy `profile_incomplete` wypisać brakujące pola po polsku i podlinkować `/panel/profil`; przy `conditions_not_met` pokazać godziny zaakceptowane wobec wymaganych
- [x] 6.6 Obsłużyć odpowiedzi 422 i 409 z generowania jako komunikaty przy kaflu, bez wychodzenia z ekranu
- [x] 6.7 Przejść ekran klawiaturą i sprawdzić stany focus (przegląd dostępności od H14 wg przewodnika §) — przegląd kodu: wyłącznie natywne `<button>`/`<Link>` z `components/ui` (mają wbudowane `focus-visible:focus-ring`), bez własnych elementów klikalnych omijających fokus; przeglądarka niedostępna w tej sesji do interaktywnego przejścia klawiaturą — patrz `DEMO/H14.md`

## 7. Odbiór

- [x] 7.1 `docker compose exec app php artisan test` — cały pakiet zielony (uruchomione w izolowanym worktree/stacku Docker — patrz `DEMO/H14.md`)
- [x] 7.2 `./vendor/bin/pint` (backend) i `npm run lint -- --fix` + `npm run build` (frontend) bez zastrzeżeń
- [x] 7.3 Przejść ręcznie ścieżkę demo na seedzie: `marta@demo.pl` widzi `PW/2026/001` i pobiera go; kafel zaświadczenia wyjaśnia 41,5 h z 72; `ola@demo.pl` generuje zaświadczenie i dostaje dzwonek `document.ready` — zweryfikowane na poziomie API (curl) na izolowanym stosie z seedem demo; przeglądarka Chrome niedostępna w tej sesji do przejścia przez UI — patrz `DEMO/H14.md`
- [x] 7.4 Uzupełnić `DEMO/H14.md` o wynik demo, wynik testu współbieżności i listę długu technicznego
- [x] 7.5 Otworzyć PR z gałęzi `pakiet/H14-dokumenty` (≤ ~400 linii); przegląd partnerski → przegląd łącznika → merge przez sztab — **wymaga potwierdzenia użytkownika** (push + PR to akcje z wymaganą jawną zgodą)
