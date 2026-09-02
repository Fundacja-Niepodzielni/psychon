<?php

namespace Tests\Concerns;

/**
 * Wymaganie środowiska dla testów, które muszą rozwidlić proces.
 *
 * Wcześniej każdy taki test zaczynał się od
 * `if (! function_exists('pcntl_fork')) { markTestSkipped(...); }`.
 * To wygląda ostrożnie, a działa odwrotnie: w obrazie bez `pcntl` trzy testy
 * współbieżności znikają z przebiegu, suita jest ZIELONA i nikt się nie dowiaduje,
 * że najtrudniejsze kontrole w projekcie nie zostały wykonane. Dokładnie ta klasa
 * co „suma zielonych nie jest dowodem" — liczba, która rośnie, uspokaja.
 *
 * Od teraz brak `pcntl` jest NIEPOWODZENIEM. Pominięcie zostaje możliwe, ale musi
 * być DECYZJĄ: `CONCURRENCY_TESTS_SKIP=1` w środowisku. Allowlista wyjątku zamiast
 * milczącej rezygnacji (`WYTYCZNE-PRACY-PSYCHON` §8.1, §8.4; `ZLECENIE-005` §3).
 *
 * Sama DECYZJA mieszka w `ConcurrencyRequirement`, bo w traicie byłaby niemierzalna:
 * w środowisku z `pcntl` dwie z trzech gałęzi nigdy się nie wykonują, a do stałych
 * traitu nie da się odwołać przez jego nazwę.
 * Świadek: `tests/Unit/Przyrzad/RequiresProcessConcurrencyTest.php`.
 */
trait RequiresProcessConcurrency
{
    protected function requireProcessConcurrency(): void
    {
        $skipFlag = $_SERVER['CONCURRENCY_TESTS_SKIP']
            ?? $_ENV['CONCURRENCY_TESTS_SKIP']
            ?? (getenv('CONCURRENCY_TESTS_SKIP') ?: null);

        $decision = ConcurrencyRequirement::decide(
            function_exists('pcntl_fork'),
            $skipFlag === null ? null : (string) $skipFlag,
        );

        if ($decision === ConcurrencyRequirement::RUN) {
            return;
        }

        if ($decision === ConcurrencyRequirement::SKIP) {
            $this->markTestSkipped(
                'Testy współbieżności pominięte JAWNIE (CONCURRENCY_TESTS_SKIP=1). '
                .'To jest decyzja, nie brak — przebieg NIE dowodzi poprawności numeracji ani limitów miejsc.',
            );
        }

        $this->fail(
            'Brak rozszerzenia PHP `pcntl`, więc testu współbieżności NIE DA SIĘ wykonać. '
            .'To jest niepowodzenie, nie pominięcie: bez niego suita byłaby zielona, a najtrudniejsze '
            .'kontrole w projekcie (numeracja bez dziur, limit miejsc pod obciążeniem) nie zostałyby '
            .'wykonane wcale. Dołóż `pcntl` do rozszerzeń środowiska (w CI: lista `setup-php`) albo '
            .'pomiń JAWNIE przez CONCURRENCY_TESTS_SKIP=1 i napisz w meldunku, że to zrobiłaś.',
        );
    }
}
