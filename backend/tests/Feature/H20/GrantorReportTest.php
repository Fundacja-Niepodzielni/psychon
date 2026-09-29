<?php

namespace Tests\Feature\H20;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Edition;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\Test as KnowledgeTest;
use App\Models\TestAttempt;
use App\Models\User;
use App\Services\H19\DashboardSummary;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H20 · raport w ukladzie grantodawcy (`GET /admin/report/grantor` +
 * `/export.csv`) — wylacznie liczby zbiorcze, zero wierszy osob. Kazda liczba
 * wspolna z `GET /admin/report` albo z karta osoby ma tu tyle samo zrodlo co
 * tam (`GrantorReportAggregates`, docblock klasy).
 *
 * Kazdy koszyk ma "dystraktor": wiersz, ktory istnieje w bazie, ale NIE
 * powinien wejsc do wyniku (zly status, spoza okresu, odwolana obecnosc,
 * konto personelu) — to on czerwieni probe, gdy filtr w agregacie sie popsuje.
 */
class GrantorReportTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string FROM = '2026-03-01';

    private const string TO = '2026-03-31';

    public function test_indicators_match_fixtures_and_exclude_out_of_scope_rows(): void
    {
        $edition = Edition::factory()->create();

        // -- przyjete zgloszenia (`applications.status` + `decided_at`) --
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-03-10']);
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-03-20']);
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-05-01']); // dystraktor: poza okresem
        Application::factory()->create(['edition_id' => $edition->id, 'status' => 'new']); // dystraktor: nieprzyjete

        // -- w programie (`users.role`/`status`, stan biezacy, bez wlasnej daty) --
        $volA = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);
        $volB = User::factory()->create(['role' => 'student', 'status' => 'active']);
        User::factory()->create(['role' => 'volunteer', 'status' => 'blocked']); // dystraktor: zablokowana

        // -- ukonczone (`users.program_completed_at`) --
        User::factory()->create(['role' => 'volunteer', 'status' => 'active', 'program_completed_at' => '2026-03-15']);
        User::factory()->create(['role' => 'volunteer', 'status' => 'active', 'program_completed_at' => '2026-06-01']); // dystraktor: poza okresem (i wciaz wyklucza z "w programie")

        // -- usuniete (`users.anonymized_at`) --
        User::factory()->create(['role' => 'volunteer', 'status' => 'deleted', 'anonymized_at' => '2026-03-05']);
        User::factory()->create(['role' => 'volunteer', 'status' => 'deleted', 'anonymized_at' => '2026-07-01']); // dystraktor: poza okresem

        // -- kontrola dodatnia znanej pulapki filtra: konta personelu ze
        // statusem aktywnym NIE MOGA wpasc do koszyka "w programie", mimo ze
        // spelniaja kazdy warunek poza rola. --
        User::factory()->create(['role' => 'instructor', 'status' => 'active']);
        User::factory()->create(['role' => 'project_manager', 'status' => 'active']);
        User::factory()->create(['role' => 'super_admin', 'status' => 'active']);

        // -- kurs sciezki z testem (ten sam zbior, ktory liczy karta osoby) --
        $course = Course::create([
            'title' => 'Kurs raportu grantodawcy',
            'slug' => 'kurs-raportu-grantodawcy-'.Str::random(6),
            'type' => 'course',
            'sequence_order' => 1,
            'is_published' => true,
        ]);
        $test = KnowledgeTest::create(['course_id' => $course->id, 'question_count' => 5]);

        // Kazde z trzech kont ponizej jest jednoczesnie osoba "w programie"
        // (rola volunteer, status aktywny, bez daty ukonczenia) — to WLASNIE
        // pomijanie takich kont w liczniku bylo znana pulapka: licz je.
        $passerInRange = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);
        $passerOutOfRange = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);
        $failer = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);
        $outOfRangeAttendee = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);

        $passed = TestAttempt::create([
            'user_id' => $passerInRange->id, 'test_id' => $test->id, 'attempt_number' => 1,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 90, 'passed' => true,
        ]);
        $passed->forceFill(['created_at' => '2026-03-12'])->save();

        $passedOutside = TestAttempt::create([
            'user_id' => $passerOutOfRange->id, 'test_id' => $test->id, 'attempt_number' => 1,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 90, 'passed' => true,
        ]);
        $passedOutside->forceFill(['created_at' => '2026-08-01'])->save(); // dystraktor: poza okresem

        $failed = TestAttempt::create([
            'user_id' => $failer->id, 'test_id' => $test->id, 'attempt_number' => 1,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 30, 'passed' => false,
        ]);
        $failed->forceFill(['created_at' => '2026-03-12'])->save(); // dystraktor: niezaliczony

        // -- certyfikaty (`certificates.issued_at`) --
        Certificate::create([
            'user_id' => $passerInRange->id, 'edition_id' => $edition->id, 'number' => 'NP/2026/901',
            'issued_at' => '2026-03-18', 'verification_token' => Str::random(40),
        ]);
        Certificate::create([
            'user_id' => $passerOutOfRange->id, 'edition_id' => $edition->id, 'number' => 'NP/2026/902',
            'issued_at' => '2026-07-01', 'verification_token' => Str::random(40),
        ]); // dystraktor: poza okresem

        // -- superwizje potwierdzone (`supervision_signups.attendance` + slot) --
        $supervisor = User::factory()->create(['role' => 'instructor', 'status' => 'active']);
        $slotInRange = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id, 'starts_at' => '2026-03-11 10:00', 'duration_minutes' => 90, 'seats_limit' => 5,
        ]);
        $slotOutOfRange = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id, 'starts_at' => '2026-08-11 10:00', 'duration_minutes' => 90, 'seats_limit' => 5,
        ]);

        SupervisionSignup::create(['slot_id' => $slotInRange->id, 'user_id' => $passerInRange->id, 'attendance' => 'present']);
        SupervisionSignup::create(['slot_id' => $slotInRange->id, 'user_id' => $failer->id, 'attendance' => 'absent']); // dystraktor: nieobecny
        SupervisionSignup::create(['slot_id' => $slotInRange->id, 'user_id' => $passerOutOfRange->id, 'attendance' => 'present', 'cancelled_at' => now()]); // dystraktor: odwolana
        SupervisionSignup::create(['slot_id' => $slotOutOfRange->id, 'user_id' => $outOfRangeAttendee->id, 'attendance' => 'present']); // dystraktor: poza okresem

        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report/grantor?from='.self::FROM.'&to='.self::TO);

        $response->assertOk();
        $response->assertJsonPath('data.period.from', self::FROM);
        $response->assertJsonPath('data.period.to', self::TO);
        $response->assertJsonPath('data.indicators.participants_by_status.accepted', 2);
        $response->assertJsonPath('data.indicators.participants_by_status.in_program', 6);
        $response->assertJsonPath('data.indicators.participants_by_status.completed', 1);
        $response->assertJsonPath('data.indicators.participants_by_status.removed', 1);
        $response->assertJsonPath('data.indicators.tests_passed_total', 1);
        $response->assertJsonPath('data.indicators.certificates_issued_total', 1);
        $response->assertJsonPath('data.indicators.supervisions_confirmed_total', 1);

        // Nazwane konta u gory (`$volA`, `$volB`) nie sa uzyte w zadnej
        // asercji poza samym ich istnieniem — trzymam referencje, zeby
        // czytelnik widzial, ktore dwa konta stoja za czescia liczby 6.
        $this->assertNotNull($volA->id);
        $this->assertNotNull($volB->id);
    }

    public function test_empty_period_with_no_matching_rows_returns_zeros(): void
    {
        // Baza ma zero wierszy poza kontem administratora tworzonym przez
        // `actingAsRole` — okres bez zadnego pasujacego zdarzenia daje same
        // zera, nie brak pola.
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report/grantor?from=2099-01-01&to=2099-01-31');

        $response->assertOk();
        $response->assertJsonPath('data.indicators.participants_by_status.accepted', 0);
        $response->assertJsonPath('data.indicators.participants_by_status.completed', 0);
        $response->assertJsonPath('data.indicators.participants_by_status.removed', 0);
        $response->assertJsonPath('data.indicators.tests_passed_total', 0);
        $response->assertJsonPath('data.indicators.certificates_issued_total', 0);
        $response->assertJsonPath('data.indicators.supervisions_confirmed_total', 0);
    }

    public function test_boundaries_of_from_and_to_are_inclusive(): void
    {
        $edition = Edition::factory()->create();

        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => self::FROM]);
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => self::TO]);
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-02-28']); // dystraktor: dzien przed
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-04-01']); // dystraktor: dzien po

        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report/grantor?from='.self::FROM.'&to='.self::TO);

        $response->assertOk();
        $response->assertJsonPath('data.indicators.participants_by_status.accepted', 2);
    }

    public function test_authentication_and_roles_are_enforced(): void
    {
        $this->getJson('/api/v1/admin/report/grantor')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
        $this->getJson('/api/v1/admin/report/grantor/export.csv')
            ->assertStatus(401);

        $this->actingAsRole('volunteer');
        $this->getJson('/api/v1/admin/report/grantor')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->actingAsRole('instructor');
        $this->getJson('/api/v1/admin/report/grantor')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_project_manager_can_access_both_routes(): void
    {
        $this->actingAsRole('project_manager');

        $this->getJson('/api/v1/admin/report/grantor')->assertOk();

        $csvResponse = $this->get('/api/v1/admin/report/grantor/export.csv');
        $csvResponse->assertOk();
        $csvResponse->assertHeader('content-type', 'text/csv; charset=utf-8');
    }

    public function test_from_after_to_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/report/grantor?from=2026-03-31&to=2026-03-01')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_malformed_date_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/report/grantor?from=31-03-2026')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_unknown_query_parameter_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/report/grantor?role=volunteer')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_csv_export_has_bom_separator_header_and_content_type(): void
    {
        $edition = Edition::factory()->create();
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-03-10']);

        $this->actingAsRole('super_admin');

        $response = $this->get('/api/v1/admin/report/grantor/export.csv?from='.self::FROM.'&to='.self::TO);

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=utf-8');

        $csv = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);

        $rows = $this->readCsvRows($csv);
        $this->assertSame(['wskaznik', 'wartosc'], $this->readHeaderRow($csv));

        $map = [];
        foreach ($rows as [$label, $value]) {
            $map[$label] = $value;
        }

        $this->assertSame('1', $map['participants_by_status.accepted']);
    }

    /**
     * Zero danych osobowych — to sprawozdanie liczbowe, nie wykaz osob.
     * Kontrola dodatnia: gdyby ktos dodal pole z imieniem/nazwiskiem/e-mailem
     * do odpowiedzi albo do pliku, ta proba by je zlapala.
     */
    public function test_response_and_csv_contain_no_personal_data(): void
    {
        $edition = Edition::factory()->create();
        User::factory()->create([
            'role' => 'volunteer',
            'status' => 'active',
            'first_name' => 'Jankowa',
            'last_name' => 'Testowska',
            'email' => 'jankowa.testowska@example.test',
            'pesel' => '90010112349',
        ]);
        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => '2026-03-10']);

        $this->actingAsRole('super_admin');

        $jsonResponse = $this->getJson('/api/v1/admin/report/grantor?from='.self::FROM.'&to='.self::TO);
        $json = json_encode($jsonResponse->json());

        foreach (['Jankowa', 'Testowska', 'jankowa.testowska@example.test', '90010112349'] as $needle) {
            $this->assertStringNotContainsString($needle, $json);
        }

        $csv = $this->get('/api/v1/admin/report/grantor/export.csv?from='.self::FROM.'&to='.self::TO)
            ->streamedContent();

        foreach (['Jankowa', 'Testowska', 'jankowa.testowska@example.test', '90010112349'] as $needle) {
            $this->assertStringNotContainsString($needle, $csv);
        }

        $forbiddenInLabel = [
            'imie', 'nazwisko', 'first_name', 'last_name', 'email', 'e-mail',
            'pesel', 'telefon', 'phone', 'adres', 'address', 'login', 'nazwa_uzytkownika', 'id',
        ];

        foreach ($this->readCsvRows($csv) as [$label, $value]) {
            foreach ($forbiddenInLabel as $needle) {
                $this->assertStringNotContainsStringIgnoringCase(
                    $needle,
                    $label,
                    "wiersz '{$label}' wyglada na pole osobowe (zawiera '{$needle}')",
                );
            }
        }
    }

    /**
     * Rownosc z `GET /admin/report`: zmiana stanu jednej osoby (ukonczenie
     * programu) przesuwa wskaznik raportu grantodawcy i licznik pulpitowy
     * (`DashboardSummary`, ten sam zrodlowy warunek) o dokladnie ta sama
     * wartosc. Obie liczby, przed i po, trafiaja do komunikatu asercji.
     */
    public function test_completed_count_moves_together_with_admin_report(): void
    {
        $user = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);

        $this->actingAsRole('super_admin');

        $before = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.participants_by_status.completed');
        $beforeDashboard = DashboardSummary::build()['counters']['completed'];
        $this->assertSame($before, $beforeDashboard);

        $user->forceFill(['program_completed_at' => now()])->save();

        $after = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.participants_by_status.completed');
        $afterDashboard = DashboardSummary::build()['counters']['completed'];

        fwrite(STDERR, sprintf(
            "[rownosc completed] przed: raport=%d pulpit=%d; po: raport=%d pulpit=%d\n",
            $before,
            $beforeDashboard,
            $after,
            $afterDashboard,
        ));

        $this->assertSame($before + 1, $after);
        $this->assertSame($afterDashboard, $after);
    }

    /**
     * Rownosc z karta osoby (`GET /admin/users/{id}`, pole
     * `progress.path_tests_passed`): zaliczenie nowego testu przesuwa
     * wskaznik raportu i pole karty tej samej osoby o dokladnie 1.
     */
    public function test_tests_passed_total_moves_together_with_the_person_card(): void
    {
        $course = Course::create([
            'title' => 'Kurs rownosci testow',
            'slug' => 'kurs-rownosci-testow-'.Str::random(6),
            'type' => 'course',
            'sequence_order' => 1,
            'is_published' => true,
        ]);
        $test = KnowledgeTest::create(['course_id' => $course->id, 'question_count' => 5]);
        $user = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);

        $this->actingAsRole('super_admin');

        $before = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.tests_passed_total');
        $cardBefore = $this->getJson("/api/v1/admin/users/{$user->id}")
            ->json('data.progress.path_tests_passed');
        $this->assertSame(0, $cardBefore);

        TestAttempt::create([
            'user_id' => $user->id, 'test_id' => $test->id, 'attempt_number' => 1,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 90, 'passed' => true,
        ]);

        $after = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.tests_passed_total');
        $cardAfter = $this->getJson("/api/v1/admin/users/{$user->id}")
            ->json('data.progress.path_tests_passed');

        fwrite(STDERR, sprintf(
            "[rownosc tests_passed] przed: raport=%d karta=%d; po: raport=%d karta=%d\n",
            $before,
            $cardBefore,
            $after,
            $cardAfter,
        ));

        $this->assertSame($before + 1, $after);
        $this->assertSame($cardBefore + 1, $cardAfter);
        $this->assertSame($after, $cardAfter);
    }

    /**
     * Rownosc z karta osoby (`GET /admin/users/{id}`, pole
     * `progress.supervision_present`): potwierdzona obecnosc przesuwa
     * wskaznik raportu i pole karty tej samej osoby o dokladnie 1.
     */
    public function test_supervisions_confirmed_total_moves_together_with_the_person_card(): void
    {
        $supervisor = User::factory()->create(['role' => 'instructor', 'status' => 'active']);
        $user = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);
        $slot = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id, 'starts_at' => now()->addDay(), 'duration_minutes' => 90, 'seats_limit' => 5,
        ]);
        $signup = SupervisionSignup::create(['slot_id' => $slot->id, 'user_id' => $user->id, 'attendance' => null]);

        $this->actingAsRole('super_admin');

        $before = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.supervisions_confirmed_total');
        $cardBefore = ProgressAggregator::for($user->fresh())['supervision_present'];
        $this->assertSame(0, $cardBefore);

        $signup->forceFill(['attendance' => 'present'])->save();

        $after = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.supervisions_confirmed_total');
        $cardAfter = ProgressAggregator::for($user->fresh())['supervision_present'];

        fwrite(STDERR, sprintf(
            "[rownosc supervisions] przed: raport=%d karta=%d; po: raport=%d karta=%d\n",
            $before,
            $cardBefore,
            $after,
            $cardAfter,
        ));

        $this->assertSame($before + 1, $after);
        $this->assertSame($cardBefore + 1, $cardAfter);
        $this->assertSame($after, $cardAfter);
    }

    /**
     * Rownosc z `GET /admin/report` i `GET /admin/dashboard`: wydanie
     * certyfikatu jednej osobie przesuwa `certificates_issued_total` (bez
     * okresu) i oba jego odpowiedniki (`summary.certificates_issued`,
     * `counters.certificates`) o dokladnie ta sama wartosc. Odczyt przed i
     * po idzie przez trasy, nie przez wywolanie klasy wprost.
     */
    public function test_certificates_issued_total_moves_together_with_report_and_dashboard(): void
    {
        $edition = Edition::factory()->create();
        $user = User::factory()->create(['role' => 'volunteer', 'status' => 'active']);

        $this->actingAsRole('super_admin');

        $before = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.certificates_issued_total');
        $beforeReport = $this->getJson('/api/v1/admin/report')
            ->json('data.summary.certificates_issued');
        $beforeDashboard = $this->getJson('/api/v1/admin/dashboard')
            ->json('data.counters.certificates');
        $this->assertSame($before, $beforeReport);
        $this->assertSame($before, $beforeDashboard);

        Certificate::create([
            'user_id' => $user->id, 'edition_id' => $edition->id, 'number' => 'NP/2026/903',
            'issued_at' => now(), 'verification_token' => Str::random(40),
        ]);

        $after = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.certificates_issued_total');
        $afterReport = $this->getJson('/api/v1/admin/report')
            ->json('data.summary.certificates_issued');
        $afterDashboard = $this->getJson('/api/v1/admin/dashboard')
            ->json('data.counters.certificates');

        fwrite(STDERR, sprintf(
            "[rownosc certificates] przed: raport=%d admin_report=%d pulpit=%d; po: raport=%d admin_report=%d pulpit=%d\n",
            $before,
            $beforeReport,
            $beforeDashboard,
            $after,
            $afterReport,
            $afterDashboard,
        ));

        $this->assertSame($before + 1, $after);
        $this->assertSame($after, $afterReport);
        $this->assertSame($after, $afterDashboard);
    }

    /**
     * Rownosc z `GET /admin/report` (`summary.admitted`): przyjecie jednego
     * zgloszenia przesuwa `participants_by_status.accepted` BEZ OKRESU i
     * `summary.admitted` o dokladnie ta sama wartosc — obie liczby licza to
     * samo zapytanie (`Application::accepted()->count()`).
     */
    public function test_accepted_without_period_moves_together_with_admin_report_admitted(): void
    {
        $edition = Edition::factory()->create();

        $this->actingAsRole('super_admin');

        $before = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.participants_by_status.accepted');
        $beforeReport = $this->getJson('/api/v1/admin/report')
            ->json('data.summary.admitted');
        $this->assertSame($before, $beforeReport);

        Application::factory()->accepted()->create(['edition_id' => $edition->id, 'decided_at' => now()]);

        $after = $this->getJson('/api/v1/admin/report/grantor')
            ->json('data.indicators.participants_by_status.accepted');
        $afterReport = $this->getJson('/api/v1/admin/report')
            ->json('data.summary.admitted');

        fwrite(STDERR, sprintf(
            "[rownosc accepted] przed: raport=%d admin_report=%d; po: raport=%d admin_report=%d\n",
            $before,
            $beforeReport,
            $after,
            $afterReport,
        ));

        $this->assertSame($before + 1, $after);
        $this->assertSame($after, $afterReport);
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    private function readCsvRows(string $csv): array
    {
        $csv = ltrim($csv, "\xEF\xBB\xBF");
        $lines = array_filter(explode("\n", str_replace("\r\n", "\n", trim($csv))));

        $rows = [];
        foreach ($lines as $index => $line) {
            if ($index === 0) {
                continue; // naglowek "wskaznik;wartosc"
            }
            [$label, $value] = array_pad(str_getcsv($line, ';', '"', ''), 2, '');
            $rows[] = [$label, $value];
        }

        return $rows;
    }

    /**
     * @return list<string>
     */
    private function readHeaderRow(string $csv): array
    {
        $csv = ltrim($csv, "\xEF\xBB\xBF");
        $lines = array_filter(explode("\n", str_replace("\r\n", "\n", trim($csv))));
        $first = array_values($lines)[0] ?? '';

        return str_getcsv($first, ';', '"', '');
    }
}
