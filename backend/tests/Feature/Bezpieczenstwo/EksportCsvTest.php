<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próba luki z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersz V5.3.1.
 *
 * `App\Support\Csv::download()` zapisuje komórki bez neutralizacji formuł, a imię
 * i nazwisko ustawia sama osoba. Komórka zaczynająca się od `=`, `+`, `-`, `@`,
 * tabulatora albo CR otwiera się w arkuszu kalkulacyjnym jako formuła.
 */
class EksportCsvTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    public function test_komorka_zaczynajaca_sie_od_formuly_jest_zneutralizowana(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V5.3.1: eksport CSV nie neutralizuje formuł.');

        User::factory()->create(['first_name' => '=1+1', 'last_name' => '@SUMA']);
        $this->actingAsRole('project_manager');

        $tresc = $this->get('/api/v1/admin/users/export.csv')->assertOk()->streamedContent();

        $this->assertStringContainsString("'=1+1", $tresc);
        $this->assertStringContainsString("'@SUMA", $tresc);
    }
}
