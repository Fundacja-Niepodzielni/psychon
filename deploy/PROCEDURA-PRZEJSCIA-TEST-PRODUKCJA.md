# Procedura przejścia test → produkcja — PsychON

Procedura zamienia środowisko, na którym trwała faza testowa, w produkcję. Wykonuje się ją
**jeden raz**, tuż przed udostępnieniem platformy uczestnikom.

## W skrócie, zwykłym językiem

**Co znika.** Wszystkie konta próbne i wszystko, co zostało po fazie testowej: zgłoszenia,
postępy w lekcjach, podejścia do testów, wpisy stażu, zapisy na superwizje, certyfikaty
i dokumenty, powiadomienia, skrzynka e-maili, wiadomości, eksporty danych oraz **dziennik
zdarzeń i dziennik wglądu w dane wrażliwe z fazy testowej**. Znikają też pliki, na które te
wpisy wskazywały (skany dyplomów, załączniki profili, pliki PDF, eksporty).

**Co zostaje.** Treść programu (kursy, tematy, lekcje, materiały, testy, wzory dokumentów,
dokumenty prawne, słownik form stażu, ustawienia edycji) oraz konta personelu wskazane na
liście właściciela (role i zasady wyboru: `deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md`).

**Od czego zaczyna się dziennik produkcji.** Dziennik zdarzeń produkcji zaczyna się od
jednego wpisu o czyszczeniu: kto je wykonał (polecenie konsoli), kiedy, ile wierszy
usunięto z każdej tabeli i ile kont zostało. Wpis nie zawiera żadnej osoby ani wolnego
tekstu. W tej samej chwili zapisuje się **znacznik startu produkcji**; od tej chwili
polecenie czyszczące odmawia każdego kolejnego uruchomienia.

**Czego procedura nie robi.** Nie zmienia ról w systemie kont Fundacji (to krok 7,
administrator tożsamości), nie usuwa kopii zapasowych z fazy testowej (znikają z rotacją
kopii) i nie dotyka niczego poza bazą i plikami osób.

Narzędziem jest polecenie `php artisan psychon:zero-danych-probnych`
(`backend/app/Console/Commands/ZeroDanychProbnychCommand.php`, podział tabel na „zostaje”
i „znika” w `backend/app/Services/Cutover/ProbeDataPurge.php`).

## Jak czytać kroki

Każdy krok ma cztery części: **kto** go wykonuje, **polecenie**, **czym zmierzyć**, że się
udał, i **co gdy inaczej**. Kroku nie zalicza się „na oko” — zalicza go zapisany wynik
pomiaru. Gdy pomiar wyjdzie inaczej niż opisano, procedura staje w tym miejscu i nie
przechodzi się do następnego kroku. Kroki wykonywane przez właściciela są oznaczone
**ręka właściciela**; żaden z nich nie jest wykonywany przez repozytorium ani przez agenta.

**Kolejność jest wiążąca:** kopia → odtworzenie próbne kopii z wynikiem → bieg na sucho →
czyszczenie → liczniki po czyszczeniu i próba odmowy dziennika → kontrola kont → kontrola zrzutu →
protokół i otwarcie. Bez udanego odtworzenia kopii (krok 3) kroki 4 i 5 się nie zaczynają.

## Role i zmienne

Dokument nie zawiera nazw hostów, adresów, osób ani sekretów. Wartości zależne od hosta
występują jako nazwane zmienne; ich wartości są w sejfie Fundacji i w pliku konfiguracji
kopii na hoście (wzór: `deploy/prod/kopie.env.example`).

| Rola w procedurze | Kto to jest |
|---|---|
| **właściciel** | osoba z kontem `super_admin` po stronie Fundacji; decyduje o starcie i o każdym zatrzymaniu |
| **administrator hosta** | osoba z dostępem do powłoki hosta produkcji (dostępy: `deploy/INSTRUKCJA-KOMPLET-DOSTEPOW.md`) |
| **administrator tożsamości** | osoba zarządzająca systemem kont Fundacji (Keycloak) |

| Zmienna | Znaczenie | Skąd wartość |
|---|---|---|
| `PROJEKT_COMPOSE` | nazwa projektu `docker compose` produkcji | konfiguracja kopii, w sejfie |
| `DB_UZYTKOWNIK`, `DB_NAZWA` | rola i baza PostgreSQL aplikacji | konfiguracja kopii, w sejfie |
| `KATALOG_KOPII` | katalog kopii na hoście (prawa `700`) | konfiguracja kopii, w sejfie |
| `KATALOG_KOPII_KONFIG` | katalog z plikiem konfiguracji kopii | w sejfie |
| `KATALOG_SKRYPTOW_KOPII` | katalog, z którego harmonogram uruchamia skrypty kopii | w sejfie |
| `KATALOG_STORAGE` | katalog `storage` aplikacji na hoście | konfiguracja kopii, w sejfie |
| `TABELE_KONTROLNE` | lista tabel kontrolnych kopii | konfiguracja kopii |
| `PLIK_LISTY` | plik z identyfikatorami kont, które zostają (format: `deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md` §2) | tworzony w chwili przejścia z danych w sejfie, poza repozytorium |
| `KATALOG_REPO` | kopia robocza repozytorium na hoście (do przyrządu kontroli zrzutu i skryptu odtworzenia) | w sejfie |

Skrót używany niżej (administrator hosta ustawia go w swojej powłoce po wczytaniu
konfiguracji kopii):

```bash
set -a; . "$KATALOG_KOPII_KONFIG/kopie.env"; set +a
dc() { docker compose -p "$PROJEKT_COMPOSE" "$@"; }
```

Wszystkie pliki wynikowe procedury trafiają do `"$KATALOG_KOPII/przejscie-$(date +%Y%m%d)"`
(prawa `700`). Wyjście polecenia czyszczącego niesie wyłącznie nazwy tabel i liczby; zrzuty
bazy z kroków 2 i 8 niosą dane osób i nie opuszczają hosta.

## Krok 1 — wstrzymanie zmian i wersja z `main`

- **Kto:** właściciel ogłasza wstrzymanie (**ręka właściciela**); administrator hosta wykonuje.
- **Polecenie:**

  ```bash
  P="$KATALOG_KOPII/przejscie-$(date +%Y%m%d)"; install -d -m 0700 "$P"
  date '+%Y-%m-%d %H:%M:%S %Z' | tee "$P/00-start.txt"
  dc exec -T app php artisan down
  dc stop queue scheduler
  git -C "$KATALOG_REPO" fetch origin
  git -C "$KATALOG_REPO" rev-parse origin/main | tee "$P/01-sha-main.txt"
  dc exec -T app php artisan list psychon | grep -c 'psychon:zero-danych-probnych'
  ```

- **Czym zmierzyć:**
  - `dc ps` pokazuje usługi `queue` i `scheduler` jako zatrzymane; strona aplikacji
    odpowiada kodem `503` (przerwa techniczna);
  - SHA wersji wdrożonej na produkcji (zapisuje go wdrożenie — instrukcja wdrożenia dla
    właściciela) jest równe SHA z `01-sha-main.txt`;
  - ostatnie polecenie wypisuje `1` — wdrożona wersja zawiera polecenie przejścia.
- **Co gdy inaczej:** SHA różne albo polecenia brak (`0`) → najpierw wdrożenie wersji z
  `main` zwykłą ścieżką wdrożenia produkcji, potem krok 1 od początku. Usługi nie stają →
  nie przechodzić dalej: zadania w tle mogłyby zapisać nowe ślady osób próbnych po
  wykonaniu kopii.

## Krok 2 — kopia bazy przed przejściem

- **Kto:** administrator hosta.
- **Polecenie:** nocny skrypt kopii uruchomiony ręcznie (ten sam, który działa z
  harmonogramu: `deploy/prod/kopia-nocna.sh`), a obok niego tekstowy zrzut danych do
  kontroli w kroku 8:

  ```bash
  "$KATALOG_SKRYPTOW_KOPII/kopia-nocna.sh" "$KATALOG_KOPII_KONFIG/kopie.env"; echo "EXIT=$?"
  dc exec -T pgsql pg_dump -U "$DB_UZYTKOWNIK" --data-only "$DB_NAZWA" > "$P/02-zrzut-przed.sql"
  chmod 600 "$P/02-zrzut-przed.sql"
  grep -c '^COPY ' "$P/02-zrzut-przed.sql"
  ls -1t "$KATALOG_KOPII"/psychon-baza-*.dump | head -1 | tee "$P/02-plik-kopii.txt"
  ls -1t "$KATALOG_KOPII"/psychon-baza-*.liczby | head -1 | tee "$P/02-plik-liczb.txt"
  ```

- **Czym zmierzyć:** `EXIT=0`; w `KATALOG_KOPII` są nowe pliki `psychon-baza-*.dump`,
  `psychon-baza-*.liczby` i `psychon-storage-*.tar.gz` z bieżącym znacznikiem czasu;
  ostatnia linia `kopie.log` kończy się słowami „zakonczona bez bledow”; liczba bloków
  `COPY` w zrzucie tekstowym jest większa od zera.
- **Co gdy inaczej:** bez udanej kopii nie ma przejścia — przyczynę wskazuje `kopie.log`
  (zrzut bazy, archiwum storage, miejsce na dysku). Kopia z tego kroku niesie dane osób
  próbnych: zostaje w `KATALOG_KOPII` do końca okresu retencji i znika razem z rotacją;
  nie kopiuje się jej nigdzie poza zwykły cel kopii.

## Krok 3 — odtworzenie próbne kopii z wynikiem

Kopia, której nie umiemy odtworzyć, nie jest zabezpieczeniem. Ten krok sprawdza, że świeża
kopia z kroku 2 odtwarza się w oddzielnym, tymczasowym kontenerze bez sieci i że liczby
wierszy zgadzają się z zapisem z chwili kopii.

- **Kto:** administrator hosta.
- **Polecenie:**

  ```bash
  bash "$KATALOG_REPO/deploy/prod/odtworzenie-probne.sh" "$(cat "$P/02-plik-kopii.txt")" \
    "$(cat "$P/02-plik-liczb.txt")" > "$P/03-odtworzenie.txt" 2>&1; echo "EXIT=$?"
  tail -n 3 "$P/03-odtworzenie.txt"
  ```

- **Czym zmierzyć:** `EXIT=0`; ostatnia linia wyniku to
  `odtworzenie probne: OK, wszystkie liczby wierszy zgodne`; w pliku nie ma linii z
  `NIEZGODNOSC`. Wynik, godzinę i nazwy plików wpisuje się do protokołu odtworzenia
  (`deploy/PROTOKOL-ODTWORZENIA-PROBNEGO.md`, wypełniany długopisem w obecności właściciela).
- **Co gdy inaczej:** każdy kod inny niż `0` zatrzymuje przejście. Najpierw przyczyna
  (uszkodzony zrzut, brak Dockera, rozjazd liczb), potem nowa kopia (krok 2) i ten krok od
  początku. Kroków 4 i 5 nie wykonuje się bez zapisanego, udanego odtworzenia.

## Krok 4 — bieg na sucho z licznikiem

- **Kto:** administrator hosta; właściciel porównuje liczby z sejfem (**ręka właściciela**).
- **Polecenie:**

  ```bash
  dc cp "$PLIK_LISTY" app:/tmp/konta-zostaja.txt
  dc exec -T app php artisan psychon:zero-danych-probnych --zachowaj=/tmp/konta-zostaja.txt \
    > "$P/04-bieg-na-sucho.txt" 2>&1; echo "EXIT=$?"
  grep -E '^(KONTA|WYNIK|PLIKI)' "$P/04-bieg-na-sucho.txt"
  grep 'kategoria=tresc' "$P/04-bieg-na-sucho.txt" | grep -vc ' usunac=0 '
  ```

- **Czym zmierzyć:**
  - `EXIT=0`, pierwsza linia pliku to `BIEG NA SUCHO (nic nie jest zmieniane)`;
  - linia `KONTA zachowane=… (super_admin=… project_manager=… instructor=…)` zgadza się z
    liczbami zapisanymi w sejfie (lista ról: `deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md` §1);
  - ostatnie polecenie wypisuje `0` — żadna tabela treści programu (`kategoria=tresc`)
    nie ma niczego do usunięcia;
  - liczba `usunac_kont` z linii `WYNIK BIEG_NA_SUCHO` jest równa liczbie kont w bazie
    minus liczba kont z listy; niezależnie od polecenia:

    ```bash
    dc exec -T pgsql psql -U "$DB_UZYTKOWNIK" -d "$DB_NAZWA" -tAc 'select count(*) from users'
    ```

  - linie `TABELA audit_log …` i `TABELA sensitive_access_log …` pokazują dzienniki
    z `usunac` równym `przed` — dzienniki fazy testowej znikają w całości;
  - linia `PLIKI wskazane=… istniejace=…` — dwie liczby zapisane do protokołu.
- **Co gdy inaczej:**
  - `EXIT=2` i linia `ODMOWA: …` — polecenie nazywa przyczynę (brak pliku, pusta lista,
    wiersz niebędący liczbą, wpis wskazujący konto spoza ról personelu, brak konta
    `super_admin`, tabela bez kategorii, przejście już wykonane). Baza jest bez zmian.
    Właściciel poprawia listę w sejfie, administrator hosta tworzy plik od nowa, krok 4 od
    początku. „Tabele bez kategorii” oznaczają, że wdrożona wersja ma tabelę, której
    polecenie nie zna — przejście staje do czasu dopisania jej w `ProbeDataPurge`
    i wdrożenia tej zmiany;
  - liczby `KONTA` albo `usunac_kont` inne niż w sejfie → stop; właściciel wyjaśnia różnicę
    przed krokiem 5.

## Krok 5 — czyszczenie

- **Kto:** administrator hosta, po zgodzie właściciela wydanej na liczbach z kroku 4
  (**ręka właściciela**).
- **Polecenie:** `N` to liczba `usunac_kont` z linii `WYNIK BIEG_NA_SUCHO` kroku 4 —
  polecenie odmawia, gdy w chwili biegu liczba kont do usunięcia jest inna.

  ```bash
  dc exec -T app php artisan psychon:zero-danych-probnych --zachowaj=/tmp/konta-zostaja.txt \
    --wykonaj --potwierdz=N > "$P/05-czyszczenie.txt" 2>&1; echo "EXIT=$?"
  grep -E '^(WYNIK|PLIKI|ZNACZNIK|DZIENNIK|BLAD|ODMOWA)' "$P/05-czyszczenie.txt"
  dc exec -T app php artisan cache:clear
  dc exec -T app php artisan queue:clear redis --force
  ```

- **Czym zmierzyć:** `EXIT=0`; linia `WYNIK BIEG_WLASCIWY usunieto_kont=N osob_spoza_listy_po=0`;
  linia `ZNACZNIK start_produkcji=zapisany`; linia `DZIENNIK pierwszy_wpis=trial_data.purged`;
  linia `PLIKI wskazane=… usunieto=… brak_na_dysku=… bledow=0`. Całe usuwanie w bazie
  (łącznie z dziennikami, wpisem o czyszczeniu i znacznikiem startu) dzieje się w jednej
  transakcji: przerwanie w połowie zostawia stan sprzed czyszczenia. Przed zatwierdzeniem
  polecenie porównuje każdą tabelę z planem; pliki usuwa dopiero po zatwierdzeniu.
  Pamięć podręczna i kolejka (Redis — poza bazą, więc poza poleceniem) są czyszczone
  dwoma ostatnimi poleceniami.
- **Dziennik.** Dzienniki audytu i wglądu nie dają się zmienić ani opróżnić zwykłą ścieżką
  aplikacji — chroni je blokada w bazie (migracja `2026_10_01_140000_lock_audit_tables`).
  Polecenie otwiera ją tylko na czas własnej transakcji i najpierw czyści oba dzienniki,
  a dopiero potem konta (inaczej klucze obce odmówiłyby usunięcia). **Wycofanie migracji
  blokady na produkcji tylko na słowo właściciela.**
- **Co gdy inaczej:**
  - `EXIT=2`, `ODMOWA: …` (np. liczba w `--potwierdz` inna niż bieżąca) → baza bez zmian;
    wrócić do kroku 4;
  - `EXIT=2` z odmową „przejście zostało już wykonane” → czyszczenie jest jednorazowe.
    Znacznik startu produkcji już stoi; nic nie jest zmieniane. Jeśli to nie jest pomyłka
    w środowisku, decyzja o dalszych krokach należy do właściciela;
  - `EXIT=1` z linią `BLAD w trakcie biegu (…)` → transakcja wycofana, baza bez zmian.
    W nawiasie jest tylko klasa błędu. Procedura staje, przyczynę wyjaśnia się przed
    ponowieniem kroku 4;
  - `EXIT=1` przy linii `WYNIK BIEG_WLASCIWY` i `bledow` większym od zera → **baza jest już
    po przejściu**, nie udało się usunąć części plików. Wierszy wskazujących na te pliki już
    nie ma, więc kolejny bieg polecenia ich nie usunie (i tak odmówi — znacznik startu
    już stoi). Pliki osób, które zostały na dysku, są sprawą administratora hosta: liczy je
    w kroku 6 (licznik plików osób), wpisuje liczbę do protokołu i usuwa je dopiero na
    zapisaną w protokole decyzję właściciela, po usunięciu przyczyny błędu (najczęściej
    prawa do katalogu).

## Krok 6 — liczniki po czyszczeniu i próba odmowy dziennika

Aplikacja nadal jest w przerwie technicznej, a usługi w tle stoją — liczniki mierzą stan
tuż po czyszczeniu.

- **Kto:** administrator hosta.
- **Polecenie:**

  ```bash
  dc exec -T app php artisan psychon:zero-danych-probnych --sprawdz \
    > "$P/06-sprawdzenie.txt" 2>&1; echo "EXIT=$?"
  cat "$P/06-sprawdzenie.txt"
  dc exec -T pgsql psql -U "$DB_UZYTKOWNIK" -d "$DB_NAZWA" -tAc \
    "select count(*) from users where role in ('volunteer','student')"
  for T in $TABELE_KONTROLNE; do printf '%s ' "$T"; dc exec -T pgsql psql -U "$DB_UZYTKOWNIK" \
    -d "$DB_NAZWA" -tAc "select count(*) from $T"; done
  find "$KATALOG_STORAGE/app/private/exports" "$KATALOG_STORAGE/app/private/pdf" \
    "$KATALOG_STORAGE/app/private/profile-documents" -type f 2>/dev/null | wc -l
  ```

  Opcja `--sprawdz` niczego nie zmienia (cała kontrola idzie w transakcji, która jest
  zawsze wycofywana) i nie wymaga listy kont. Działa także po znaczniku startu.
- **Czym zmierzyć:**
  - `EXIT=0` i ostatnia linia `WYNIK SPRAWDZ ZALICZONE`;
  - linia `SPRAWDZ uczestnicy=0` — zapytanie kontrolne „zero uczestników próbnych”;
    to samo mierzy niezależne zapytanie o konta `volunteer` i `student`, które wypisuje `0`;
  - linia `SPRAWDZ slady_osob=0` — każda tabela śladów osób jest pusta;
  - linia `SPRAWDZ dziennik_audytu wierszy=1 pierwszy=trial_data.purged` i
    `SPRAWDZ dziennik_wgladu wierszy=0` — dziennik produkcji zaczyna się od jednego wpisu
    o czyszczeniu;
  - linia `PROBA_DZIENNIKA usuniecie=odmowa zmiana=odmowa oproznienie=odmowa dopisanie=dziala` —
    rola aplikacji nie może usunąć ani zmienić wpisu w żadnym z dwóch dzienników, może
    dopisać (próba dopisuje wpis w transakcji, która jest wycofywana — po sprawdzeniu
    w dzienniku nie zostaje nic);
  - `users` w tabelach kontrolnych równa się liczbie kont z listy; `editions` i `courses`
    są równe liczbom z pliku `.liczby` z kroku 2 (treść programu nietknięta);
    `applications` wynosi `0`;
  - licznik plików w katalogach plików osób (eksporty RODO, PDF certyfikatów i dokumentów,
    załączniki profili) wynosi `0`. Materiały kursów leżą poza tymi katalogami i zostają.
- **Co gdy inaczej:** `EXIT=3` — linia `SPRAWDZ …` albo `PROBA_DZIENNIKA …` wskazuje, co się nie
  zgadza. Jeśli powodem jest próba dziennika (odmowa nie zadziałała), dziennik nie jest chroniony:
  przejścia nie ogłasza się, a przyczynę (brak migracji blokady) wyjaśnia się przed
  otwarciem aplikacji. Jeśli jakaś tabela śladów nie jest pusta, coś zapisało nowe wiersze
  po kroku 5 — sprawdzić wstrzymanie z kroku 1 i zacząć od kroku 2 (znacznik startu
  uniemożliwia ponowne czyszczenie, więc dalsze postępowanie wskazuje właściciel).
  Liczba plików większa od zera → postępowanie z ostatniego punktu kroku 5.

## Krok 7 — kontrola kont personelu według listy

- **Kto:** właściciel (panel; **ręka właściciela**), administrator tożsamości (system kont
  Fundacji; **ręka administratora tożsamości**).
- **Polecenie:**

  ```bash
  dc exec -T pgsql psql -U "$DB_UZYTKOWNIK" -d "$DB_NAZWA" -tAc \
    "select role, status, count(*) from users group by role, status order by role, status"
  ```

  Następnie właściciel loguje się do panelu administracji, a administrator tożsamości
  przegląda role PsychON w systemie kont Fundacji.
- **Czym zmierzyć:** liczby kont per rola równe liczbom z sejfu dla tabeli w
  `deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md` §1, wszystkie ze statusem `active`; właściciel
  wchodzi do panelu administracji swoim kontem; w systemie kont Fundacji role PsychON
  mają wyłącznie tożsamości osób z listy (`deploy/KONTA-PERSONELU-PO-PRZEJSCIU.md` §4).
- **Co gdy inaczej:** brak konta z listy w bazie → przywrócenie z kopii z kroku 2
  (`deploy/PROTOKOL-ODTWORZENIA-PROBNEGO.md`) po decyzji właściciela — polecenie nie usuwa
  kont z listy, więc brak oznacza błąd listy albo błąd polecenia i wymaga wyjaśnienia przed
  otwarciem. Tożsamość spoza listy z rolą PsychON → administrator tożsamości odbiera rolę
  przed krokiem 9.

## Krok 8 — kontrola zrzutu na danych próbnych

- **Kto:** administrator hosta.
- **Polecenie:** przyrząd `deploy/kontrola-zrzutu-danych-probnych/kontrola-zrzutu.sh`
  (kontrakt i kody wyjścia: `README.md` w tym katalogu) na zrzucie sprzed przejścia
  (krok 2) i zrzucie po nim:

  ```bash
  dc exec -T pgsql pg_dump -U "$DB_UZYTKOWNIK" --data-only "$DB_NAZWA" > "$P/08-zrzut-po.sql"
  chmod 600 "$P/08-zrzut-po.sql"
  K="$KATALOG_REPO/deploy/kontrola-zrzutu-danych-probnych"
  bash "$K/kontrola-zrzutu.sh" "$P/02-zrzut-przed.sql" "$P/08-zrzut-po.sql" \
    "$K/wzorce-probne.txt" > "$P/08-kontrola-zrzutu.txt" 2>&1; echo "EXIT=$?"
  ```

- **Czym zmierzyć:** `EXIT=0` (ZALICZONE: kontrola dodatnia na zrzucie przed przejściem
  znalazła wzorce, zrzut po przejściu ma ich zero).
- **Co gdy inaczej:**
  - `EXIT=3` — zmierzone naruszenie; plik wyniku wymienia relację, miejsce i wzorzec (bez
    wartości pola). Gdy relacją jest `users`, a wzorzec to domena próbna, konto personelu z
    listy ma adres z fazy testowej — właściciel zmienia go w panelu administracji na
    właściwy i krok 8 powtarza się od zrzutu po. Każda inna relacja → stop, przejście nie
    jest zakończone; przyczynę wyjaśnia się przed otwarciem;
  - `EXIT=2` — nie zmierzono; plik wyniku nazywa przyczynę. Najważniejsza: kontrola dodatnia
    nie przeszła, czyli wzorce z `wzorce-probne.txt` nie rozpoznają danych próbnych tego
    środowiska. Wtedy nie ogłasza się „zero” — lista wzorców jest uzupełniana zwykłą
    zmianą w repozytorium, a krok 8 powtarzany.

## Krok 9 — wpis do protokołu i otwarcie

- **Kto:** właściciel wpisuje i podpisuje (**ręka właściciela**); administrator hosta podaje
  liczby z plików w `$P`.
- **Polecenie:**

  ```bash
  dc exec -T app php artisan up
  dc start queue scheduler
  dc exec -T app rm -f /tmp/konta-zostaja.txt
  rm -f "$PLIK_LISTY" "$P/02-zrzut-przed.sql" "$P/08-zrzut-po.sql"
  date '+%Y-%m-%d %H:%M:%S %Z' | tee "$P/09-koniec.txt"
  ```

- **Czym zmierzyć:** strona aplikacji odpowiada kodem innym niż `503`; usługi `queue` i
  `scheduler` działają; protokół ma wypełnione wszystkie wiersze poniżej. Protokół
  przechowuje się tam, gdzie protokoły odtworzenia kopii
  (`deploy/PROTOKOL-ODTWORZENIA-PROBNEGO.md`) — poza repozytorium.
- **Co gdy inaczej:** brak którejkolwiek liczby w protokole → przejście nie jest
  zakończone; brakujący pomiar wykonuje się, zanim aplikacja zostanie ogłoszona jako
  produkcyjna. Oba zrzuty tekstowe i plik listy usuwa administrator hosta jako ostatnią
  czynność; usunięcie wpisuje się do protokołu.

### Wzór protokołu (wypełniany ręcznie, bez danych osób)

| Pole | Wartość |
|---|---|
| Data i godzina startu (z `00-start.txt`) | |
| SHA `main` (z `01-sha-main.txt`) = SHA wdrożony | |
| Kopia z kroku 2: nazwy plików `.dump`, `.liczby`, `.tar.gz`; `EXIT` | |
| Odtworzenie próbne z kroku 3: `EXIT`; ostatnia linia wyniku | |
| Bieg na sucho: linia `KONTA …`; `usunac_kont`; `usunac_wierszy`; `PLIKI wskazane/istniejace` | |
| Czyszczenie: `EXIT`; `usunieto_kont`; `osob_spoza_listy_po`; `PLIKI usunieto/brak_na_dysku/bledow`; linia `ZNACZNIK` | |
| Sprawdzenie z kroku 6: `EXIT`; `uczestnicy`; `slady_osob`; `dziennik_audytu`; linia `PROBA_DZIENNIKA` | |
| Konta uczestników `0`; pliki osób `0` | |
| `editions`/`courses` po = przed (z `.liczby`) | |
| Konta personelu per rola = sejf; logowanie właściciela; role w systemie kont | |
| Kontrola zrzutu: `EXIT` | |
| Zrzuty tekstowe i plik listy usunięte (data i godzina) | |
| Data i godzina otwarcia (z `09-koniec.txt`) | |
| Podpis właściciela | |

Osoba, która wykonała czyszczenie, jest wpisana tylko w tym protokole — wpis w dzienniku
produkcji jej nie zawiera.

## Czego polecenie nie robi

- Nie zmienia ról w systemie kont Fundacji (krok 7, administrator tożsamości).
- Nie czyści pamięci podręcznej ani kolejki w Redis (krok 5, dwa osobne polecenia).
- Nie usuwa plików, na które nie wskazuje żaden wiersz bazy (krok 6, licznik plików
  osób, decyzja właściciela).
- Nie usuwa kopii zapasowych z fazy testowej — znikają z rotacją kopii.
- Nie zapisuje niczego do logu aplikacji. Jedynym śladem w bazie są: wpis o czyszczeniu
  w dzienniku zdarzeń i znacznik startu produkcji.
- Nie daje osobnej roli bazy dla zadań aplikacji ani nie zmienia uprawnień w bazie.
