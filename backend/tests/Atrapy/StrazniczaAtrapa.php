<?php

namespace Tests\Atrapy;

use Illuminate\Contracts\Foundation\Application;
use Tests\TestCase;

/**
 * Atrapa klasy testowej — istnieje po to, żeby dało się URUCHOMIĆ drugi punkt kontrolny
 * strażnika (`TestCase::setUpTraits()`) w warunkach, których prawdziwy przebieg nie ma
 * prawa mieć: pusta deklaracja, baza spoza rodziny deklaracji.
 *
 * Mieszka w `tests/Atrapy`, a NIE w `tests/Unit` ani `tests/Feature`, bo obie te ścieżki
 * są testsuite'ami w `phpunit.xml` (w. 9 i 12) — atrapa dziedzicząca po `Tests\TestCase`
 * zostałaby tam zebrana jako klasa testowa bez testów i zaśmieciła przebieg.
 *
 * Używana przez `tests/Feature/Przyrzad/GuardUnderParallelTest.php`.
 */
class StrazniczaAtrapa extends TestCase
{
    /**
     * Wykonuje DOKŁADNIE to, co framework wykonuje między przełączeniem bazy przez
     * runner równoległy a jej wyczyszczeniem przez `RefreshDatabase`
     * (`InteractsWithTestCaseLifecycle.php:106`). Atrapa nie używa żadnej cechy
     * bazodanowej, więc `parent::setUpTraits()` po przejściu kontroli nic nie kasuje.
     */
    public function przejdzPunktKontrolnyPrzedCzyszczeniem(Application $app): void
    {
        $this->app = $app;

        $this->setUpTraits();
    }
}
