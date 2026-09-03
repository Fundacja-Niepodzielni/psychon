# Stos izolowany sesji TESTY i skąd bierze się baza `niepodzielni_testing`

Notatka pomiarowa. Wszystko poniżej zmierzone w klonie `sprint-1-testy` od `b08ca0e`,
02.09.2026, projekt compose `psytesty`.

## 1 · Skąd bierze się baza testowa — POMIAR, nie założenie

Wcześniejsze założenie („bazę trzeba utworzyć ręcznie, bo `scripts/setup.sh` jej nie tworzy")
**jest nieprawdziwe i zostaje tu wycofane**. Przepis istnieje w repo i wygląda tak:

`backend/tests/bootstrap.php`, w. 15–45 — przed uruchomieniem suity łączy się do bazy
`postgres`, sprawdza `SELECT 1 FROM pg_database WHERE datname = ?` i, jeśli trzeba, wykonuje
`CREATE DATABASE niepodzielni_testing`. Nazwa jest tam **wpisana na sztywno** (w. 26), niezależnie
od `DB_DATABASE`.

**I to jest dokładnie mechanizm, który czyni pułapkę `P-1` cichą.** Baza `niepodzielni_testing`
powstaje ZAWSZE — także wtedy, gdy suita jedzie po bazie demo. Ktoś, kto sprawdza izolację
pytaniem „czy baza testowa istnieje?", dostaje odpowiedź „tak" i **nie dowiaduje się niczego**:
istnienie pustej bazy obok jest zgodne z obydwoma wynikami. Pytanie, które rozróżnia, brzmi
**„na jakiej bazie stoi POŁĄCZENIE"** — i tylko `select current_database()` na nie odpowiada.

Wniosek do przepisu: nie ma czego dopisywać do setupu. Jest co dopisać do **kontroli**.

## 2 · Stos izolowany — przepis odtwarzalny

Nieśledzony `docker-compose.override.yml` w katalogu głównym klonu (dopisany do
`.git/info/exclude`, więc nie wejdzie do żadnego commita):

```yaml
services:
  app:     { container_name: psytesty_app }
  queue:   { container_name: psytesty_queue }
  pgsql:   { container_name: psytesty_pgsql, ports: !reset [] }
  redis:   { container_name: psytesty_redis }
  mailpit: { container_name: psytesty_mailpit }
```

Powód `container_name`: repo ma nazwy **stałe** (`np_app`, `np_queue`, `np_pgsql`, `np_mailpit`),
więc sama zmiana nazwy projektu compose NIE wystarcza — dwa stosy zderzyłyby się o nazwę kontenera.
(`redis` w repo nazwy stałej nie ma — nadana dla spójności.)

Zmienne: `COMPOSE_PROJECT_NAME=psytesty`, `NP_APP_PORT=8403`, `NP_MAILPIT_PORT=8413`.

**`ports: !reset []` DZIAŁA** w Docker Compose v5.1.1 (pomiar: `docker compose config` nie pokazuje
`published` dla `pgsql`). Zamiennik z `NP_DB_PORT` nie był potrzebny — port bazy nie jest wystawiony
na hosta, więc żaden inny stos ani klient z hosta nie ma jak w tę bazę wejść.

Sprzątanie — wyłącznie własny projekt: `docker compose -p psytesty down -v`.

## 3 · Środowisko jest częścią pomiaru (§8.3)

| co | zmierzone |
|---|---|
| użytkownik procesu testów | `www-data` (uid 33) — **nie root**; ten sam, który obsługuje żądania |
| rozszerzenie `pcntl` | **obecne** → testy z `pcntl_fork` naprawdę biegną, nie są cicho pomijane przez `markTestSkipped` |
| port bazy na hoście | **niewystawiony** |
| `origin` push | `DISABLED` |

Wiersz o `pcntl` jest tu nieprzypadkowo: cztery testy w repo zaczynają się od
`if (! function_exists('pcntl_fork')) { markTestSkipped(...) }`. W środowisku bez `pcntl`
przebiegłyby jako **pominięte**, a suita i tak byłaby „zielona". Sprawdzenie obecności rozszerzenia
jest częścią pomiaru, nie ciekawostką o obrazie.

## 4 · Jak uruchamiam bramkę

Bez potoku maskującego kod wyjścia (`| tail` oddaje kod `tail`, prawie zawsze zero):

```bash
cd D:/tmp/psy/testy/psychon
MSYS_NO_PATHCONV=1 docker compose -p psytesty exec -T app php artisan test > /d/tmp/psy/testy/bramka.log 2>&1
echo "kod wyjścia: $?"
grep '\[PRZYRZĄD\] baza testowa' /d/tmp/psy/testy/bramka.log
```

Nazwa bazy pochodzi z linii `[PRZYRZĄD]`, którą wypisuje strażnik w `tests/TestCase.php` —
**z silnika, nie z pliku konfiguracji**. To jest liczba, którą wolno cytować w meldunku.

## 5 · Bramka frontu — `tsc --noEmit` NIE jest spełnialne na świeżym klonie

Pomiar 02.09.2026, klon `sprint-1-testy`:

| krok | kod wyjścia | uwaga |
|---|--:|---|
| `npx tsc --noEmit` na czystym `b08ca0e` (bez moich zmian) | **2** | `app/layout.tsx(10,50): TS2304: Cannot find name 'LayoutProps'` |
| `npx tsc --noEmit` z moimi zmianami | **2** | ten sam, jeden błąd → **to nie jest regresja runnera** |
| `npx next typegen` | 0 | `✓ Types generated successfully`, tworzy `.next/types/{routes,root-params,cache-life}.d.ts` |
| `npx tsc --noEmit` **po** `next typegen` | **0** | |

`LayoutProps` to typ generowany przez Next do `.next/types`, a `tsconfig.json` te pliki
`include`-uje. Świeży klon nie ma katalogu `.next`, więc kontrola typów pada na czymś,
czego nikt nie napisał.

**Wniosek praktyczny:** `next typegen` istnieje w Next 16.3 i wystarcza — **pełny `next build`
nie jest do tego potrzebny**. Bramka frontu w najtańszej spełnialnej postaci:

```bash
npm run lint          # eslint
npx next typegen      # generuje .next/types (sekundy, nie minuty)
npx tsc --noEmit      # kontrola typów
npm test              # vitest run
```

`.next/` jest w `frontend/.gitignore` (w. 17), więc krok `typegen` nie brudzi drzewa.

## 6 · Runner testów frontu — kontrola w dwie strony

| perturbacja | oczekiwane | zmierzone |
|---|---|---|
| runner nie znajduje żadnego testu | ma paść | `No test files found`, kod **1** (`passWithNoTests: false`) |
| podmieniona oczekiwana wartość (30 → 31) | czerwień | `expected [10,20,30] to deeply equal [10,20,31]`, kod **1** |
| stan przywrócony | zieleń | 10 zielonych, kod **0** |

Pierwsza pozycja jest ważniejsza, niż wygląda: runner, który nic nie znalazł, wypisuje
komunikat nieodróżnialny od „wszystko przeszło", jeśli tylko kod wyjścia jest zerowy.

## 7 · Test bez `RefreshDatabase` dziedziczy obowiązek sprzątania (P-6)

Zmierzone na własnej wadzie, zgłoszonej przez inną sesję 02.09.2026.

`EmptyEditionConcurrentCertificateTest` świadomie nie używa `RefreshDatabase` — i słusznie,
bo ta cecha owija test w otwartą transakcję, której procesy potomne nigdy nie zobaczą jako
zatwierdzonej, więc **prawdziwej współbieżności nie da się nią zmierzyć**.

Cena tej decyzji jest jednak większa, niż wygląda: **wszystko, co taki test zapisze, zostaje**.
Pierwsza wersja sprzątała własne 20 kont i własną edycję, ale nie sprzątała **seedu demo,
który sama wywołała**. Skutek:

| gdzie | wynik |
|---|---|
| świadek uruchomiony sam (`--filter=`) | **zielony** — i mierzył dokładnie to, co miał |
| pełna suita w obcym drzewie | **9 czerwonych** w `H14`, `H18`, `H21`, `Notifications` |

Testy zakładające pustą bazę zastawały sześć kont demo. Kolejność alfabetyczna katalogów
zrobiła resztę: `H13` biegnie przed `H14`, `H18`, `H21` i `Notifications`.

**To jest najgorszy możliwy kształt wady w przyrządzie**, bo uruchomienie pojedyncze jej nie
pokazuje — a właśnie tak sprawdza się test, o którym się myśli, że jest podejrzany.

**Reguła:** test rezygnujący z `RefreshDatabase` ma zostawić bazę w stanie **zastanym**
i **udowodnić to asercją na wyjściu**. „Uruchomiony sam jest zielony" nie jest dowodem —
o tym, kto zastanie resztki, decyduje kolejność katalogów, a nie autor testu.

Pomiar po naprawie: `users` w `niepodzielni_testing` = **0** po przebiegu świadka,
baza demo nietknięta (6 kont), koszt sprzątania (`migrate:fresh`) mieści się w czasie
samego świadka (13,3 s razem).

**`H14\ConcurrentDocumentNumberTest`** stosuje ten sam wzorzec (brak `RefreshDatabase`,
`Process::pool`), ale **nie wywołuje seedu** — zakłada własną edycję i dziesięć kont fabryką
i kasuje je w `tearDown` razem z dokumentami, powiadomieniami, e-mailami i wpisami audytu.
Czyli sprząta po sobie; brakuje mu wyłącznie asercji na wyjściu.

## 8 · Dwie pułapki przyrządu zmierzone przy pisaniu świadków T-3

### 8.1 · „Skutek w bazie" dla pól SZYFROWANYCH nie da się sprawdzić na kolumnie

`User` ma casty `encrypted` na `pesel`, `address_street`, `address_city`, `address_zip`.
Szyfrowanie Laravela jest **niedeterministyczne** — ten sam tekst daje za każdym razem inny
kryptogram. Skutek:

```php
$this->assertDatabaseHas('users', ['pesel' => '90010112349']);   // ⛔ NIE TRAFI NIGDY
$this->assertSame('90010112349', $user->fresh()->pesel);          // ✅ model odszyfrowuje
```

Kryterium odbioru brzmi „wywołanie API **plus** skutek w bazie". Dla pól szyfrowanych
„skutek w bazie" znaczy **odczyt przez model**, nie `psql` ani `assertDatabaseHas`.
Asercja na kolumnie byłaby czerwienią **wieczną i mylącą**: świeciłaby także po poprawnej
naprawie i wysyłała wykonawcę na poszukiwanie błędu, którego nie ma.

Złapane na sobie: pierwsza wersja świadka S1-3 miała dokładnie tę asercję.

### 8.2 · Zielone bywa faktem o losowaniu, nie o systemie

`APP_FAKER_LOCALE=pl_PL`. Pomiar: **95 na 5000** wylosowanych nazwisk (1,9%) zawiera człon
„kowal" — Kowalski, Kowalska, Kowalczyk. `H18\AdminUserQueryTest` szukał frazy `kowal`
i oczekiwał jednego trafienia, mając drugie konto z **losowym** nazwiskiem. Czyli
**mniej więcej raz na pięćdziesiąt przebiegów** ten test przegrywał bez niczyjej winy.

Najgorsze w tym jest przypisanie: czerwień trafia do rachunku sesji, która akurat uruchomiła
suitę, a nie tej, która cokolwiek zmieniła. W izolacji test był zielony pięć razy z rzędu —
czyli standardowa procedura „sprawdź w izolacji" **potwierdziłaby niewinność testu**.

Reguła: **żadna asercja nie może wisieć na wylosowanej wartości.** Dane, na których test
liczy, mają być ustawione wprost. Jeśli zależność od pola losowanego jest częścią reguły
(tu: wyszukiwanie obejmuje nazwisko), dostaje **własny jawny test**, a nie rolę niespodzianki
w cudzym.

## 9 · Przepis bramki ze strażnikiem równoległych przebiegów (P-10)

Dwa przebiegi suity na tym samym stosie biją się o `niepodzielni_testing`: jeden
`RefreshDatabase` czyści bazę pod nogami drugiemu, a wynik wygląda jak wada kodu.
Dlatego bramka **najpierw sprawdza, czy nie biegnie już inna**, i dopiero potem mierzy.

```bash
#!/usr/bin/env bash
set -o pipefail                      # bez tego kod wyjścia gubi się w potoku
cd D:/tmp/psy/testy/psychon

# strażnik: nie startuj drugiego przebiegu na tym samym stosie
if MSYS_NO_PATHCONV=1 docker compose -p psytesty exec -T app pgrep -f 'artisan test' >/dev/null; then
  echo "PRZERWANE: w stosie psytesty biegnie już 'artisan test'. Drugi przebieg mierzyłby cudzą bazę."
  exit 3
fi

MSYS_NO_PATHCONV=1 docker compose -p psytesty exec -T app ./vendor/bin/pint --test || exit 1

LOG=/d/tmp/psy/testy/bramka-$(date +%H%M).log
MSYS_NO_PATHCONV=1 docker compose -p psytesty exec -T app php artisan test > "$LOG" 2>&1
KOD=$?                               # kod czytany WPROST, nie przez potok

grep -a '\[PRZYRZĄD\] baza testowa' "$LOG"
grep -aE 'Tests:|Duration:' "$LOG"
echo "kod wyjścia: $KOD"
exit $KOD
```

Trzy rzeczy, które ten przepis wymusza, a które łatwo pominąć ręcznie:
1. **kod wyjścia czytany wprost** — `komenda | tail` oddaje kod `tail`, czyli prawie zawsze zero;
2. **nazwa bazy z logu** przy każdym wyniku, nie z pliku konfiguracji;
3. **strażnik równoległości** — najtańsza obrona przed czerwienią, której przyczyna
   leży w drugim oknie, a nie w kodzie.

Ta sama zasada dotyczy `--filter=`: filtr też czyści bazę, jeśli test używa `RefreshDatabase`.

## 10 · Strażnik stanu zastanego — dlaczego lista tabel zawsze przegra (P-6, trzecia iteracja)

Trzy razy w ciągu jednego dnia ta sama klasa błędu, za każdym razem inną tabelą:

| # | co zostawił test bez `RefreshDatabase` | kto to zauważył | koszt |
|--:|---|---|---|
| 1 | dane z `seed()` (6 kont demo) | obca sesja, we własnej bramce | 9 cudzych testów na czerwono |
| 2 | znowu `seed()`, w pliku pisanym PO spisaniu reguły | obca sesja | 23 cudze testy |
| 3 | wpisy `audit_log`, o których nikt nie pomyślał | obca sesja | 8 cudzych testów |

**Wspólny mianownik nie brzmi „trzeba uważać".** Sprzątanie wyliczające tabele jest
**denylistą** — broni tylko tego, co autor zdążył sobie wyobrazić, więc pomija dokładnie
to, o czym nie pomyślał. Z definicji.

**Zmiana rodzaju obrony:** `Tests\TestCase` robi migawkę liczności **wszystkich** tabel
schematu przed testem i po nim — ale tylko dla klas **bez** `RefreshDatabase` (klasy
z transakcją nic to nie kosztuje). Różnica w dowolnej tabeli jest czerwienią **tego**
testu, z nazwą tabeli i różnicą:

```
Test bez `RefreshDatabase` zostawił po sobie ślad w bazie testowej:
  applications: było 0, jest 2 (+2)
  audit_log: było 0, jest 1 (+1)
  users: było 0, jest 3 (+3)
```

Czerwień trafia **u autora, nie u sąsiada** — i to jest cała różnica, bo wcześniej
płacił za nią ktoś, kto nic nie zmienił.

Sprzątanie: `przywrocStanZastanejBazy()` **przywraca stan**, zamiast wyliczać, co skasować.
Działa wyłącznie, gdy stan zastany był pusty (a taki zostawia `RefreshDatabase`
poprzedniego testu); przy niepustym **rzuca zamiast zgadywać** — przyrząd nie ma prawa
kasować cudzych danych na wszelki wypadek.

**Efekt uboczny, którego nie planowałam:** strażnik od razu pokazał, że **dwa testy
współbieżności z hackathonu** (`H03\ConcurrentApplicationTest`, `H12\ConcurrentSignupTest`)
zostawiały dane **od początku** — nikt tego nie zauważył, bo nikt nie mierzył.

**Druga warstwa** (bo jedna warstwa to nie obrona): testy H08 brały `AuditLogEntry::where('action', …)
->firstOrFail()`, czyli **pierwszy wpis w tabeli** — ich wynik zależał od sąsiadów.
Zawężone do własnego podmiotu i własnego rodzaju operacji.

**Reguła w postaci wykonalnej:** *test wołający `seed()` MUSI mieć `RefreshDatabase`;
jeśli mieć go nie może (procesy potomne nie zobaczą otwartej transakcji rodzica),
nie wolno mu wołać `seed()`.* To jest sprawdzalne mechanicznie — i dopiero dlatego
jest kontrolą, a nie zdaniem w piśmie.


## 11 · Kontrola przez granicę repozytorium mieszka po obu stronach, nie po jednej

Kryterium ★ H19.1 („każdy link z pulpitu → 200 we froncie") przechodzi przez granicę
repozytorium, więc kontrola też musi. Pierwsza wersja robiła obie połowy po stronie PHP
i czytała `frontend/app` z kontenera backendu — działało **wyłącznie u mnie**, bo dołożyłam
montowanie do własnego stosu, i **pomijało się po cichu u wszystkich innych** (2 pominięcia
w bramce sesji wykonawczej, kontener backendu montuje tylko `./backend`).

**Kontrola działająca na jednej maszynie jest kontrolą tej maszyny, nie systemu.**

Podział, który trzyma:

| połowa | gdzie | czego dowodzi |
|---|---|---|
| adresy | `backend/tests/Feature/H19/DashboardLinksTest` | API zwraca **dokładnie** te cztery adresy, w kształcie z kontraktu |
| trasy | `frontend/app/__tests__/linki-pulpitu.test.ts` | każdy z nich ma plik `page.tsx` |

Obie zazębia **jedna lista adresów**, powtórzona po obu stronach celowo: zmiana adresu
w serwerze zapala test backendowy, brak trasy — frontowy. Gdyby front pytał API zamiast
trzymać stałą, oba testy sprawdzałyby to samo i rozjazd byłby niewidoczny.

Montowanie `./frontend` w `docker-compose.override.yml` **zostało usunięte** — ograniczenie
miejsca pracy zniknęło razem z przyczyną.
