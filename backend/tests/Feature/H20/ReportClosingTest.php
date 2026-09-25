<?php

namespace Tests\Feature\H20;

use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H20 · GET /admin/reports/closing?edition=<id> — raport zamknięcia jednej
 * wskazanej edycji, osobne działanie od `/admin/report` (zakres dat).
 * Uruchamiane na pełnym seedzie (`docs/hackathon/04-seed-demo.md` §5) plus
 * druga, oddzielna edycja założona w teście — kryterium: raport zamknięcia
 * zwraca WYŁĄCZNIE osoby wskazanej edycji.
 */
class ReportClosingTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_closing_report_returns_only_the_indicated_edition(): void
    {
        $this->actingAsRole('super_admin');

        $otherEdition = Edition::factory()->create(['status' => 'closed']);
        $onlyInOtherEdition = User::factory()->create([
            'role' => 'volunteer',
            'edition_id' => $otherEdition->id,
        ]);
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $response = $this->getJson("/api/v1/admin/reports/closing?edition={$otherEdition->id}");
        $response->assertOk();

        $ids = collect($response->json('data.people'))->pluck('id');

        $this->assertTrue($ids->contains($onlyInOtherEdition->id), 'Brak osoby wskazanej edycji w raporcie zamknięcia.');
        $this->assertFalse($ids->contains($marta->id), 'Osoba z INNEJ edycji przeciekła do raportu zamknięcia.');
    }

    /**
     * Kontrola negatywna dla powyższego: bez zawężenia do edycji (raport
     * bieżący, `/admin/report`) obie osoby — z aktywnej edycji seeda I z
     * nowo założonej — są widoczne razem. Dowodzi, że filtr w
     * `closing()` faktycznie coś odcina, a nie że lista jest pusta z
     * innego powodu.
     */
    public function test_the_main_report_is_not_scoped_to_a_single_edition(): void
    {
        $this->actingAsRole('super_admin');

        $otherEdition = Edition::factory()->create(['status' => 'closed']);
        $onlyInOtherEdition = User::factory()->create([
            'role' => 'volunteer',
            'edition_id' => $otherEdition->id,
        ]);
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $ids = collect($response->json('data.people'))->pluck('id');

        $this->assertTrue($ids->contains($onlyInOtherEdition->id));
        $this->assertTrue($ids->contains($marta->id));
    }

    public function test_closing_report_requires_the_edition_parameter(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/reports/closing')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_closing_report_rejects_a_non_existent_edition(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/reports/closing?edition=999999')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_closing_report_requires_authentication(): void
    {
        $edition = Edition::where('status', 'active')->firstOrFail();

        $this->getJson("/api/v1/admin/reports/closing?edition={$edition->id}")
            ->assertStatus(401);
    }

    public function test_non_admin_roles_are_forbidden_from_the_closing_report(): void
    {
        $edition = Edition::where('status', 'active')->firstOrFail();

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAsRole($role);

            $this->getJson("/api/v1/admin/reports/closing?edition={$edition->id}")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }
}
