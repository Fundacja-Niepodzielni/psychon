# Migawka reguł skanera statycznego (Semgrep) — skąd jest i dlaczego leży w repozytorium

## Czemu migawka, a nie rejestr

Wołanie `--config p/php` pobiera regułę z serwera semgrep.dev przy każdym biegu. Bramka, której
wynik zależy od cudzego serwera i od tego, co ktoś wczoraj zmienił w treści reguły, nie jest
przyrządem — jest prognozą. Ten sam powód, dla którego przypinamy obrazy i akcje po sumie SHA.
Reguły leżą więc w `.semgrep/reguly/` i skan idzie `--config .semgrep/reguly` **bez sieci**
(`--network none`), przez co bieg jest powtarzalny i nie zależy od dostępności rejestru.

## Ta migawka się starzeje

Zestaw poniżej został pobrany **2026-09-10** i od tego dnia nie dowiaduje się o nowych regułach
ani o poprawkach w istniejących. Im dalej od tej daty, tym więcej skaner przeoczy.

## Odświeżenie jest osobną rundą, nie „kiedyś"

Podmiana migawki zmienia liczbę trafień, więc jest zmianą przyrządu i wymaga własnego biegu
zielony → czerwony → zielony oraz przeglądu różnicy trafień. Nie robi się tego przy okazji
innej zmiany i nie robi się tego automatem.

## Czego NIE dopisywać do konfiguracji

Zmierzone 2026-09-10, niezależnie:

- **`p/laravel` NIE ISTNIEJE** — serwer zwraca HTTP 404. Jeśli ktoś kiedyś zobaczy tę nazwę
  w cudzym poradniku i „naprawi" nią konfigurację, wprowadzi zestaw, którego nie ma.
- **`p/nextjs` JEST PUSTY** — treść to dosłownie `rules: []` (10 znaków). Dodanie go nie zwiększa
  pokrycia o nic; daje tylko złudzenie, że front jest skanowany.

Zestawem zastępczym dla Laravela jest **`r/php.laravel`** i to on leży w tej migawce.

## Pliki

| plik | źródło | pobrano | bajtów | reguł | sha256 |
|---|---|---|---|---|---|
| `reguly/p-php.yaml` | https://semgrep.dev/c/p/php | 2026-09-10 | 64945 | 24 | `ccfc3341c7ac7a66b85f249713a277f4d4a0e9de93c75c609e2f82e52f0aabac` |
| `reguly/p-secrets.yaml` | https://semgrep.dev/c/p/secrets | 2026-09-10 | 89772 | 52 | `139b35ad3442bc83d1f0864db82fa4fdc7e1f1ee4b5ac872bfbeb604c82c6518` |
| `reguly/r-php-laravel.yaml` | https://semgrep.dev/c/r/php.laravel | 2026-09-10 | 26067 | 11 | `842a64b0c614663fb93ad186a9cea9f302efd4a9ac172f897be4eb5673e9a912` |

Razem 5070 linii i 87 reguł w plikach; skaner uruchamia z nich **74** — resztę odrzuca, bo dotyczą
języków nieobecnych w tym repozytorium. Liczba „74 reguł na 859 plikach" jest tą, którą należy
porównywać między biegami; sam kod wyjścia nie mówi, czy skaner cokolwiek obejrzał.

## Wołanie

    docker run --rm --network none -v "$PWD:/src" -v "$PWD/.semgrep/reguly:/reguly:ro" \
      -w /src semgrep/semgrep:1.169.0 semgrep scan --config /reguly --error --metrics=off .

`.semgrepignore` wyklucza `.semgrep/reguly/` ze skanowania: pliki reguł są **wejściem** skanera,
a nie kodem projektu, i trafiają we własne wzorce (`detected-ssh-password`,
`detected-pgp-private-key-block`). Bez tego wykluczenia skan zwraca 4 trafienia zamiast 2.
