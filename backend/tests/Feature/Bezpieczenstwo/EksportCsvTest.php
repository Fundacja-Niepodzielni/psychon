<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próba z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersz V5.3.1.
 *
 * Imię i nazwisko ustawia sama osoba, a eksport CSV otwiera się w arkuszu.
 * Komórka zaczynająca się od `=`, `+`, `-`, `@` byłaby formułą. Pilnowany
 * warunek: neutralizacja w `App\Support\Csv::cell()`.
 */
class EksportCsvTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_komorka_zaczynajaca_sie_od_formuly_jest_zneutralizowana(): void
    {
        User::factory()->create(['first_name' => '=1+1', 'last_name' => '@SUMA']);
        User::factory()->create(['first_name' => 'Zwykla', 'last_name' => '-Demo']);
        $this->actingAsRole('project_manager');

        $tresc = $this->get('/api/v1/admin/users/export.csv')->assertOk()->streamedContent();

        $this->assertStringContainsString(";'=1+1;'@SUMA;", $tresc);
        $this->assertStringContainsString(";Zwykla;'-Demo;", $tresc);
        $this->assertStringNotContainsString(';=1+1;', $tresc);
    }
}
