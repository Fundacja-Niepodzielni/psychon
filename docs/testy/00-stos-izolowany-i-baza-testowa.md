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
