<?php

namespace Tests\Feature\H20;

use App\Models\Certificate;
use App\Models\InternshipEntry;
use App\Models\LessonProgress;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use App\Services\H19\DashboardSummary;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
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
     * Kryterium ★1, druga połowa: zaliczone testy jako pole ODDZIELNE od
     * `stage`/`stage_label`, nie doklejone do etapu. Wartości z
     * `DemoSeeder::seedMartaProgress/seedOlaProgress/seedFilipProgress`:
     * Marta — test 1 zaliczony (90%), test 2 nie (70%) → 1; Ola — testy
     * 1-3 zaliczone → 3; Filip — zero prób → 0. Trzy różne wartości, więc
     * próba nie przechodzi na stałej "dowolna liczba".
     */
    public function test_report_shows_passed_tests_count_as_a_field_separate_from_stage(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $people = collect($response->json('data.people'));
        $marta = $people->firstWhere('id', User::where('email', 'marta@demo.pl')->firstOrFail()->id);
        $ola = $people->firstWhere('id', User::where('email', 'ola@demo.pl')->firstOrFail()->id);
        $filip = $people->firstWhere('id', User::where('email', 'filip@demo.pl')->firstOrFail()->id);

        $this->assertArrayHasKey('tests_passed', $marta);
        $this->assertSame(1, $marta['tests_passed']);
        $this->assertSame(3, $ola['tests_passed']);
        $this->assertSame(0, $filip['tests_passed']);

        // Pole odrębne od etapu, nie od niego wyprowadzone: Ola ma etap
        // 'certyfikat' (10/10 ukończonych kursów — `courses_done` w
        // `ProgressAggregator::for()`), ale `tests_passed` = 3, nie
        // 10. Gdyby pole było doklejone do liczby ukończonych kursów
        // (a nie do odrębnego `ProgressAggregator::passedTestsCount()`),
        // te dwie liczby wyszłyby równe.
        $this->assertSame('certyfikat', $ola['stage']);
        $this->assertNotSame(
            ProgressAggregator::for(User::where('email', 'ola@demo.pl')->firstOrFail())['courses_done'],
            $ola['tests_passed'],
        );
    }

    /**
     * `summary.tests_passed` — kryterium ★1 (jedno źródło): podliczenie
     * TEJ SAMEJ listy `people`, którą odpowiedź i tak zwraca (patrz
     * `ReportSummary::build()`), nie osobne zapytanie. Filip ma zero
     * zaliczonych testów, Marta i Ola co najmniej jeden — licznik musi więc
     * być mniejszy niż liczba wszystkich osób w zestawieniu, nie równy jej
     * (kontrola przeciw stałej "wszyscy" albo "nikt").
     */
    public function test_report_summary_tests_passed_counts_people_with_at_least_one_passed_test(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $people = collect($response->json('data.people'));
        $expected = $people->filter(fn (array $row): bool => $row['tests_passed'] > 0)->count();

        $this->assertGreaterThan(0, $expected);
        $this->assertLessThan($people->count(), $expected);
        $response->assertJsonPath('data.summary.tests_passed', $expected);
    }

    /**
     * `status` — pole z kontraktu pary frontowej (`active`/`blocked`,
     * `users.status`), zwykły atrybut modelu, nie licznik.
     */
    public function test_report_person_row_includes_the_account_status(): void
    {
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $martaRow = collect($response->json('data.people'))->firstWhere('id', $marta->id);

        $this->assertNotNull($martaRow);
        $this->assertSame($marta->status, $martaRow['status']);
    }

    /**
     * Kryterium ★2: alias trasy z kontraktu API (`/admin/reports`, liczba
     * mnoga) obok istniejącej `/admin/report` — ta sama koperta danych.
     */
    public function test_reports_alias_route_returns_the_same_payload_as_the_existing_route(): void
    {
        $this->actingAsRole('super_admin');

        $singular = $this->getJson('/api/v1/admin/report')->assertOk()->json('data');
        $plural = $this->getJson('/api/v1/admin/reports')->assertOk()->json('data');

        $this->assertSame($singular, $plural);
    }

    /**
     * Kryterium ★3 „jedno źródło liczb": ta sama osoba, ta sama liczba
     * godzin zaakceptowanego stażu na raporcie (`ReportSummary::people()`)
     * i na karcie osoby (`AdminUserCardResource`, H18, `ProgressAggregator::for()`)
     * — dwa NIEZALEŻNE zapytania, wartość porównana na żywo, nie ze stałej.
     */
    public function test_report_numbers_match_the_admin_user_card_for_the_same_person(): void
    {
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $reportRow = collect($this->getJson('/api/v1/admin/report')->assertOk()->json('data.people'))
            ->firstWhere('id', $marta->id);

        $card = $this->getJson("/api/v1/admin/users/{$marta->id}")->assertOk()->json('data.progress');

        $this->assertNotNull($reportRow);
        $this->assertSame($card['hours_accepted'], $reportRow['hours_accepted']);
    }

    /**
     * Ola spełnia wszystkie cztery warunki certyfikatu w seedzie
     * (`DemoSeeder::seedOlaProgress/seedOlaCompletion`): 10/10 kursów,
     * 72 h stażu (próg 72), 6 obecności na superwizji (próg 6), warsztat
     * odbyty, certyfikat wydany — etap = `certyfikat`.
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
     * Filip nie ma zaliczonego żadnego kursu (test 1 bez próby,
     * `seedFilipProgress`), zero wpisów zaakceptowanego stażu, zero
     * obecności na superwizji i brak warsztatu — pierwszy etap słownika
     * (`kurs`), zgodnie z porządkiem `CertificateConditions`.
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
     * Osoba spełnia wszystkie cztery warunki certyfikatu, ale dokument
     * jeszcze nie istnieje — etap „gotowa", odrębny od etapu z wydanym
     * certyfikatem (decyzja właściciela z 23.09.2026).
     */
    public function test_report_marks_a_person_with_full_conditions_and_no_certificate_as_ready(): void
    {
        $this->actingAsRole('super_admin');
        $person = $this->makeVolunteerWithFullConditions(withWorkshop: true);

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $row = collect($response->json('data.people'))->firstWhere('id', $person->id);

        $this->assertNotNull($row, 'Brak nowej osoby w zestawieniu imiennym.');
        $this->assertSame('gotowa', $row['stage']);
        $this->assertSame('Gotowa do certyfikatu', $row['stage_label']);
        $this->assertFalse($row['certificate_issued']);
    }

    /**
     * Ta sama sytuacja co wyżej, ale z wydanym dokumentem certyfikatu —
     * etap „certyfikat".
     */
    public function test_report_marks_a_person_with_full_conditions_and_a_certificate_as_certified(): void
    {
        $this->actingAsRole('super_admin');
        $person = $this->makeVolunteerWithFullConditions(withWorkshop: true);

        Certificate::create([
            'user_id' => $person->id,
            'edition_id' => $person->edition_id,
            'number' => 'NP/2026/900',
            'issued_at' => now(),
            'verification_token' => Str::random(40),
            'conditions_snapshot' => [
                'courses' => ['done' => 10, 'required' => 10],
                'internship' => ['done' => '72', 'required' => '72'],
                'supervision' => ['done' => 6, 'required' => 6],
                'workshop' => ['done' => true],
            ],
        ]);

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $row = collect($response->json('data.people'))->firstWhere('id', $person->id);

        $this->assertNotNull($row, 'Brak nowej osoby w zestawieniu imiennym.');
        $this->assertSame('certyfikat', $row['stage']);
        $this->assertSame('Certyfikat', $row['stage_label']);
        $this->assertTrue($row['certificate_issued']);
    }

    /**
     * Kontrola negatywna: osoba ma wydany dokument certyfikatu, ale nie ma
     * zaliczonego warsztatu — posiadanie dokumentu nie przeskakuje
     * niespełnionego warunku, etap zostaje „warsztat".
     */
    public function test_a_certificate_does_not_skip_an_unmet_condition(): void
    {
        $this->actingAsRole('super_admin');
        $person = $this->makeVolunteerWithFullConditions(withWorkshop: false);

        Certificate::create([
            'user_id' => $person->id,
            'edition_id' => $person->edition_id,
            'number' => 'NP/2026/901',
            'issued_at' => now(),
            'verification_token' => Str::random(40),
            'conditions_snapshot' => [
                'courses' => ['done' => 10, 'required' => 10],
                'internship' => ['done' => '72', 'required' => '72'],
                'supervision' => ['done' => 6, 'required' => 6],
                'workshop' => ['done' => false],
            ],
        ]);

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $row = collect($response->json('data.people'))->firstWhere('id', $person->id);

        $this->assertNotNull($row, 'Brak nowej osoby w zestawieniu imiennym.');
        $this->assertSame('warsztat', $row['stage']);
        $this->assertTrue($row['certificate_issued']);
    }

    /**
     * Zakres dat zawęża wpisy stażu Marty (9 zaakceptowanych,
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

    /**
     * Stan pusty: zakres dat bez ŻADNEGO wpisu stażu u ŻADNEJ
     * osoby — pola liczbowe muszą być `0`/pustą tablicą, nigdy `null` ani
     * nieobecne, a odpowiedź musi zostać `200`, nie błędem. Sprawdzone dla
     * WSZYSTKICH osób w zestawieniu (nie tylko jednej), żeby wykluczyć
     * przypadek, w którym pojedyncza osoba akurat nie ma wpisów niezależnie
     * od zakresu dat.
     */
    public function test_report_returns_zero_not_null_for_an_empty_date_range(): void
    {
        $this->actingAsRole('super_admin');
        $farFuture = now()->addYears(5)->toDateString();

        $response = $this->getJson("/api/v1/admin/report?from={$farFuture}&to={$farFuture}");
        $response->assertOk();

        $response->assertJsonPath('data.summary.hours_accepted_total', '0');
        $response->assertJsonPath('data.summary.hours_accepted_average', '0');
        $response->assertJsonPath('data.summary.consultations_total', 0);

        $people = collect($response->json('data.people'));
        $this->assertGreaterThan(0, $people->count(), 'Lista osób nie powinna zniknąć przy pustym zakresie dat.');

        foreach ($people as $row) {
            $this->assertArrayHasKey('hours_accepted', $row);
            $this->assertArrayHasKey('consultations', $row);
            $this->assertArrayHasKey('tests_passed', $row);
            $this->assertNotNull($row['hours_accepted']);
            $this->assertNotNull($row['consultations']);
            $this->assertNotNull($row['tests_passed']);
            $this->assertSame('0', $row['hours_accepted']);
            $this->assertSame(0, $row['consultations']);
        }
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

    /**
     * Nowy uczestnik z kompletem czterech warunków certyfikatu, opcjonalnie
     * bez warsztatu — kopiuje kwalifikujące dane od Oli (kursy, staż,
     * superwizje), ten sam wzorzec co
     * `Tests\Feature\H13\CertificatePackageCase::makeEligibleVolunteer()`
     * (osobna kopia w tym pakiecie prób zamiast dzielenia klasy pomiędzy
     * pakietami).
     */
    private function makeVolunteerWithFullConditions(bool $withWorkshop): User
    {
        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();
        $joanna = User::where('email', 'joanna@demo.pl')->firstOrFail();

        $person = User::factory()->create([
            'role' => 'volunteer',
            'edition_id' => $ola->edition_id,
            'program_completed_at' => null,
            'access_expires_at' => now()->addMonths(3),
        ]);

        foreach (LessonProgress::where('user_id', $ola->id)->get() as $progress) {
            LessonProgress::create([
                'user_id' => $person->id,
                'lesson_id' => $progress->lesson_id,
                'watched_seconds' => $progress->watched_seconds,
                'active_seconds' => $progress->active_seconds,
                'open_count' => $progress->open_count,
                'last_activity_at' => $progress->last_activity_at,
                'is_completed' => true,
                'completed_at' => now()->subDays(10),
            ]);
        }

        foreach (TestAttempt::where('user_id', $ola->id)->get() as $attempt) {
            TestAttempt::create([
                'user_id' => $person->id,
                'test_id' => $attempt->test_id,
                'attempt_number' => 1,
                'answers' => $attempt->answers,
                'questions_snapshot' => $attempt->questions_snapshot,
                'score_percent' => $attempt->score_percent,
                'passed' => true,
            ]);
        }

        InternshipEntry::create([
            'user_id' => $person->id,
            'date' => now()->subDays(20)->toDateString(),
            'hours' => '72.0',
            'form' => 'phone_duty',
            'consultations_count' => 60,
            'description' => 'Staż — bez danych osób konsultowanych.',
            'status' => 'accepted',
            'decided_by' => $joanna->id,
            'decided_at' => now()->subDays(18),
        ]);

        foreach (range(1, 6) as $n) {
            $slot = SupervisionSlot::create([
                'supervisor_id' => $joanna->id,
                'starts_at' => now()->subWeeks($n * 2),
                'duration_minutes' => 90,
                'seats_limit' => 3,
            ]);

            SupervisionSignup::create([
                'slot_id' => $slot->id,
                'user_id' => $person->id,
                'signed_up_at' => $slot->starts_at->copy()->subDays(5),
                'attendance' => 'present',
                'attendance_marked_by' => $joanna->id,
            ]);
        }

        if ($withWorkshop) {
            WorkshopCompletion::create([
                'user_id' => $person->id,
                'edition_id' => $ola->edition_id,
                'completed_at' => now()->subMonth(),
            ]);
        }

        return $person->fresh();
    }
}
