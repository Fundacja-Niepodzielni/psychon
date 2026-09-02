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
