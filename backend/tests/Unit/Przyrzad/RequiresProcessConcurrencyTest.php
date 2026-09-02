<?php

namespace Tests\Unit\Przyrzad;

use PHPUnit\Framework\TestCase;
use Tests\Concerns\ConcurrencyRequirement;

/**
 * Świadek kontroli, która pilnuje innych kontroli.
 *
 * `RequiresProcessConcurrency` decyduje, czy test współbieżności ma pobiec, zostać
 * jawnie pominięty, czy zaświecić czerwono. W środowisku z `pcntl` dwie z tych trzech
 * gałęzi nigdy się nie wykonują — czyli kontrola broniąca suity przed cichym
 * pominięciem sama byłaby niezmierzona. Dlatego decyzja jest czystą funkcją i ma tu
 * komplet przypadków.
 *
 * Ten plik dziedziczy z `PHPUnit\Framework\TestCase`, a nie z `Tests\TestCase` — nie
 * potrzebuje aplikacji ani bazy, a strażnik izolacji nie ma tu czego pilnować.
 *
 * `php artisan test --filter=RequiresProcessConcurrency`
 */
final class RequiresProcessConcurrencyTest extends TestCase
{
    public function test_runs_when_the_extension_is_present(): void
    {
        $this->assertSame(
            ConcurrencyRequirement::RUN,
            ConcurrencyRequirement::decide(true, null),
        );
    }

    public function test_fails_when_the_extension_is_missing_and_nobody_decided_otherwise(): void
    {
        // Sedno zmiany: brak rozszerzenia ma być CZERWONY, nie pominięty.
        $this->assertSame(
            ConcurrencyRequirement::FAIL,
            ConcurrencyRequirement::decide(false, null),
        );
    }

    public function test_skips_only_on_an_explicit_decision(): void
    {
        $this->assertSame(
            ConcurrencyRequirement::SKIP,
            ConcurrencyRequirement::decide(false, '1'),
        );
    }

    public function test_a_present_extension_cannot_be_switched_off_by_the_flag(): void
    {
        // KONTROLA NEGATYWNA. Gdyby flaga działała także przy obecnym `pcntl`,
        // jedna zmienna środowiskowa wyłączałaby po cichu kontrole współbieżności
        // na w pełni sprawnej maszynie — czyli wracalibyśmy do punktu wyjścia
        // innymi drzwiami.
        $this->assertSame(
            ConcurrencyRequirement::RUN,
            ConcurrencyRequirement::decide(true, '1'),
        );
    }

    /**
     * Wartości „prawie jedynka" nie są decyzją.
     *
     * Pominięcie ma wymagać dokładnie `1`. Inaczej literówka albo `CONCURRENCY_TESTS_SKIP=0`
     * czytane jako „ustawione" wyłączałyby kontrole i wyglądało to jak zamiar.
     */
    public function test_values_other_than_one_do_not_count_as_a_decision(): void
    {
        foreach (['0', '', 'true', 'yes', 'false', '01', ' 1'] as $wartosc) {
            $this->assertSame(
                ConcurrencyRequirement::FAIL,
                ConcurrencyRequirement::decide(false, $wartosc),
                "Wartość \"{$wartosc}\" została potraktowana jako świadoma zgoda na pominięcie.",
            );
        }
    }
}
