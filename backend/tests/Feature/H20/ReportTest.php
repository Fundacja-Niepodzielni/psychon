<?php

namespace Tests\Feature\H20;

use App\Models\User;
use App\Services\H19\DashboardSummary;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H20 · GET /admin/report (+ export.csv) — kryterium ★1: liczby raportu
 * = pulpit (H19 `DashboardSummary`) = karta osoby (`ProgressAggregator`).
 * Uruchamiane na pełnym seedzie (`docs/hackathon/04-seed-demo.md` §5).
 */
class ReportTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_report_summary_matches_the_dashboard_and_seed_canonical_numbers(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $dashboard = DashboardSummary::build();

        // Kryterium ★1: identyczne z pulpitem (nie tylko "policzone tak samo").
        $response->assertJsonPath('data.summary.active', $dashboard['counters']['participants']);
        $response->assertJsonPath('data.summary.completed', $dashboard['counters']['completed']);
        $response->assertJsonPath('data.summary.certificates_issued', $dashboard['counters']['certificates']);

        // Wartości wiążące z 04-seed-demo.md §5.
        $response->assertJsonPath('data.summary.active', 3);
        $response->assertJsonPath('data.summary.completed', 1);
        $response->assertJsonPath('data.summary.certificates_issued', 1);
        $response->assertJsonPath('data.summary.hours_accepted_total', '113.5');
        $response->assertJsonPath('data.summary.consultations_total', 101);
    }

    public function test_report_includes_a_named_breakdown_matching_progress_aggregator(): void
    {
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $martaRow = collect($response->json('data.people'))->firstWhere('id', $marta->id);

        $this->assertNotNull($martaRow, 'Brak Marty w zestawieniu imiennym.');
        $this->assertSame('41.5', $martaRow['hours_accepted']);
        $this->assertSame(37, $martaRow['consultations']);
        $this->assertFalse($martaRow['certificate_issued']);
    }

    /**
     * Poz. 18 „Postępy" — Ola spełnia wszystkie cztery warunki certyfikatu
     * w seedzie (`DemoSeeder::seedOlaProgress/seedOlaCompletion`): 10/10
     * kursów, 72 h stażu (próg 72), 6 obecności na superwizji (próg 6),
     * warsztat odbyty, certyfikat wydany — etap = `certyfikat`.
     */
    public function test_report_marks_a_graduate_with_the_certificate_stage(): void
    {
        $this->actingAsRole('super_admin');
        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $olaRow = collect($response->json('data.people'))->firstWhere('id', $ola->id);

        $this->assertNotNull($olaRow, 'Brak Oli w zestawieniu imiennym.');
        $this->assertSame('certyfikat', $olaRow['stage']);
        $this->assertSame('Certyfikat', $olaRow['stage_label']);
    }

    /**
     * Poz. 18 „Postępy" — Filip nie ma zaliczonego żadnego kursu (test 1
     * bez próby, `seedFilipProgress`), zero wpisów zaakceptowanego stażu,
     * zero obecności na superwizji i brak warsztatu — pierwszy etap
     * słownika (`kurs`), zgodnie z porządkiem `CertificateConditions`.
     */
    public function test_report_marks_a_person_without_progress_with_the_first_stage(): void
    {
        $this->actingAsRole('super_admin');
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $filipRow = collect($response->json('data.people'))->firstWhere('id', $filip->id);

        $this->assertNotNull($filipRow, 'Brak Filipa w zestawieniu imiennym.');
        $this->assertSame('kurs', $filipRow['stage']);
        $this->assertSame('Kursy i testy', $filipRow['stage_label']);
    }

    /**
     * Poz. 27 — zakres dat zawęża wpisy stażu Marty (9 zaakceptowanych,
     * 12–60 dni wstecz — `DemoSeeder::seedInternship`). Zakres bez
     * żadnego z tych wpisów (dziś) musi zejść z 113.5 h / 101 konsultacji
     * (baza z pierwszego testu) do zera.
     */
    public function test_report_narrows_by_date_range(): void
    {
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $today = now()->toDateString();

        $response = $this->getJson("/api/v1/admin/report?from={$today}&to={$today}");
        $response->assertOk();

        $response->assertJsonPath('data.summary.hours_accepted_total', '0');
        $response->assertJsonPath('data.summary.consultations_total', 0);

        $martaRow = collect($response->json('data.people'))->firstWhere('id', $marta->id);
        $this->assertNotNull($martaRow, 'Brak Marty w zestawieniu imiennym.');
        $this->assertSame('0', $martaRow['hours_accepted']);
        $this->assertSame(0, $martaRow['consultations']);
    }

    public function test_report_rejects_an_inverted_date_range(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report?from=2026-06-10&to=2026-06-01');

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_non_admin_roles_are_forbidden(): void
    {
        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAsRole($role);

            $this->getJson('/api/v1/admin/report')
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    public function test_report_requires_authentication(): void
    {
        $this->getJson('/api/v1/admin/report')->assertStatus(401);
    }

    public function test_export_csv_uses_the_shared_csv_helper(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->get('/api/v1/admin/report/export.csv');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=utf-8');

        $body = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);
        $this->assertStringContainsString('id;first_name;last_name;role;hours_accepted', $body);
        $this->assertStringContainsString('Marta', $body);
    }

    public function test_export_csv_requires_administration_role(): void
    {
        $this->actingAsRole('volunteer');

        $this->get('/api/v1/admin/report/export.csv')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }
}
