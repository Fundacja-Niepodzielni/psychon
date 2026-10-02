<?php

namespace Tests\Feature\H20;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\Test as KnowledgeTest;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H20 · liczby raportu roku programu dopisane do `GET /admin/report`
 * (`edition`, `period`, `program`, `students` i nowe pola wiersza osoby) oraz
 * plik `export.csv?uklad=zestawienie`.
 *
 * Mały, zmyślony zestaw danych BEZ seeda, żeby każda liczba była policzalna
 * na kartce. Każdy koszyk ma „dystraktor”, który NIE powinien wejść do
 * wyniku: student (liczby programu liczą tylko wolontariuszy), unieważniony
 * certyfikat, konto zablokowane, osoba z dyżurem tylko poza okresem, wpis
 * niezaakceptowany, odwołana obecność i konto personelu.
 */
class ReportYearProgramTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string FROM = '2026-03-01';

    private const string TO = '2026-03-31';

    private Edition $edition;

    /** @var array<string, User> */
    private array $people = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::factory()->create(['name' => 'Edycja 2026', 'starts_at' => '2026-01-01']);

        $person = fn (string $first, array $attributes = []): User => User::factory()->create([
            'first_name' => $first,
            'last_name' => 'Demo',
            'email' => Str::lower($first).'.raport@example.test',
            'edition_id' => $this->edition->id,
            ...$attributes,
        ]);

        $this->people = [
            'marta' => $person('Marta'),
            'ola' => $person('Ola', ['program_completed_at' => '2026-02-01']),
            'basia' => $person('Basia', ['status' => 'blocked']),
            'tomek' => $person('Tomek'),
            'filip' => $person('Filip', ['role' => 'student']),
            'ewa' => $person('Ewa', ['role' => 'student', 'program_completed_at' => '2026-02-15']),
        ];
        // Konto personelu w stanie aktywnym — nie wchodzi do żadnej liczby.
        $person('Joanna', ['role' => 'instructor']);

        $this->entry('marta', '2026-03-10', '4.5', 3);
        $this->entry('marta', '2026-05-05', '6.0', 5); // poza okresem
        $this->entry('marta', '2026-03-12', '2.0', 1, 'submitted'); // niezaakceptowany
        $this->entry('ola', '2026-03-15', '6.0', 4);
        $this->entry('basia', '2026-03-20', '2.0', 1); // zablokowana, godziny liczą się do sumy
        $this->entry('tomek', '2026-06-01', '3.0', 2); // wyłącznie poza okresem
        $this->entry('filip', '2026-03-11', '5.0', 2); // student

        $course = Course::create([
            'title' => 'Kurs raportu roku programu',
            'slug' => 'kurs-raportu-roku-programu-'.Str::random(6),
            'type' => 'course',
            'sequence_order' => 1,
            'is_published' => true,
        ]);
        $test = KnowledgeTest::create(['course_id' => $course->id, 'question_count' => 5]);
        foreach (['marta', 'filip'] as $key) {
            TestAttempt::create([
                'user_id' => $this->people[$key]->id, 'test_id' => $test->id, 'attempt_number' => 1,
                'answers' => [], 'questions_snapshot' => [], 'score_percent' => 90, 'passed' => true,
            ]);
        }

        Certificate::create([
            'user_id' => $this->people['marta']->id, 'edition_id' => $this->edition->id, 'number' => 'NP/2026/951',
            'issued_at' => '2026-03-18', 'verification_token' => Str::random(40),
        ]);
        Certificate::create([
            'user_id' => $this->people['ola']->id, 'edition_id' => $this->edition->id, 'number' => 'NP/2026/952',
            'issued_at' => '2026-02-02', 'verification_token' => Str::random(40),
            'revoked_at' => '2026-03-25', 'revoked_reason' => 'Próba: certyfikat unieważniony.',
        ]);
        Certificate::create([
            'user_id' => $this->people['ewa']->id, 'edition_id' => $this->edition->id, 'number' => 'NP/2026/953',
            'issued_at' => '2026-02-16', 'verification_token' => Str::random(40),
        ]);

        $supervisor = User::factory()->create(['role' => 'instructor']);
        foreach (['2026-03-02 10:00', '2026-03-09 10:00', '2026-03-16 10:00'] as $index => $startsAt) {
            $slot = SupervisionSlot::create([
                'supervisor_id' => $supervisor->id, 'starts_at' => $startsAt, 'duration_minutes' => 90, 'seats_limit' => 5,
            ]);
            SupervisionSignup::create([
                'slot_id' => $slot->id,
                'user_id' => $this->people['marta']->id,
                'attendance' => 'present',
                'cancelled_at' => $index === 2 ? now() : null, // odwołana — nie liczy się
            ]);
        }

        WorkshopCompletion::create([
            'user_id' => $this->people['marta']->id, 'edition_id' => $this->edition->id, 'completed_at' => '2026-03-20 10:00:00',
        ]);

        Application::factory()->accepted()->create(['edition_id' => $this->edition->id, 'role' => 'volunteer', 'user_id' => $this->people['marta']->id]);
        Application::factory()->accepted()->create(['edition_id' => $this->edition->id, 'role' => 'volunteer', 'user_id' => $this->people['filip']->id]); // konto studenta
        Application::factory()->accepted()->create(['edition_id' => $this->edition->id, 'role' => 'volunteer', 'user_id' => null]);
        Application::factory()->accepted()->create(['edition_id' => $this->edition->id, 'role' => 'student', 'user_id' => null]);
        Application::factory()->create(['edition_id' => $this->edition->id, 'status' => 'new', 'role' => 'volunteer']);
    }

    public function test_programme_numbers_count_volunteers_only_and_dates_narrow_hours_and_consultations(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report?from='.self::FROM.'&to='.self::TO);
        $response->assertOk();

        $response->assertJsonPath('data.program.active', 3); // Marta, Ola, Tomek — bez zablokowanej Basi i bez studentów
        $response->assertJsonPath('data.program.completed', 1); // Ola — Ewa jest studentką
        $response->assertJsonPath('data.program.admitted', 2); // konto Marty + zgłoszenie wolontariusza bez konta
        $response->assertJsonPath('data.program.with_passed_test', 1); // Marta — Filip jest studentem
        $response->assertJsonPath('data.program.certificates_valid', 1); // Marta — Ola unieważniony, Ewa studentka
        $response->assertJsonPath('data.program.hours_accepted_total', '12.5'); // 4.5 + 6 + 2
        $response->assertJsonPath('data.program.hours_accepted_average', '4.2'); // 12.5 / 3
        $response->assertJsonPath('data.program.consultations_total', 8); // 3 + 4 + 1

        $response->assertJsonPath('data.students.active', 2);
        $response->assertJsonPath('data.students.completed', 1);

        $response->assertJsonPath('data.edition.id', $this->edition->id);
        $response->assertJsonPath('data.edition.name', 'Edycja 2026');
        $response->assertJsonPath('data.edition.starts_at', '2026-01-01');
        $response->assertJsonPath('data.period.from', self::FROM);
        $response->assertJsonPath('data.period.to', self::TO);
    }

    public function test_without_dates_hours_and_consultations_cover_every_accepted_entry_and_the_state_today_is_the_same(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        $response->assertJsonPath('data.program.hours_accepted_total', '21.5'); // 4.5 + 6 + 6 + 2 + 3
        $response->assertJsonPath('data.program.consultations_total', 15); // 3 + 5 + 4 + 1 + 2
        $response->assertJsonPath('data.program.active', 3);
        $response->assertJsonPath('data.program.certificates_valid', 1);
        $response->assertJsonPath('data.period.from', null);
        $response->assertJsonPath('data.period.to', null);
    }

    public function test_the_old_summary_fields_are_unchanged_and_still_count_every_certificate(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report');
        $response->assertOk();

        // Dotychczasowe pole czyta stary ekran i jest równe licznikowi pulpitu: liczy też unieważniony.
        $response->assertJsonPath('data.summary.certificates_issued', 3);
        $response->assertJsonPath('data.summary.active', 5); // wolontariusze i studenci w stanie aktywnym
    }

    public function test_a_range_without_events_gives_zeros_and_keeps_the_state_today(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report?from=2025-01-01&to=2025-01-31');
        $response->assertOk();

        $response->assertJsonPath('data.program.hours_accepted_total', '0');
        $response->assertJsonPath('data.program.hours_accepted_average', '0');
        $response->assertJsonPath('data.program.consultations_total', 0);
        $response->assertJsonPath('data.program.active', 3);
        $response->assertJsonPath('data.program.completed', 1);
    }

    public function test_each_named_row_carries_internship_supervision_workshop_and_role(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/v1/admin/report?from='.self::FROM.'&to='.self::TO);
        $response->assertOk();
        $rows = collect($response->json('data.people'))->keyBy('id');

        $marta = $rows->get($this->people['marta']->id);
        $this->assertSame('volunteer', $marta['role']);
        $this->assertSame(['done' => '10.5', 'required' => '72'], $marta['internship']); // stan dziś: 4.5 + 6
        $this->assertSame(['attended' => 2, 'required' => 6], $marta['supervision']); // bez odwołanej
        $this->assertSame('2026-03-20T10:00:00Z', $marta['workshop_completed_at']);
        $this->assertSame('4.5', $marta['hours_accepted']); // w okresie
        $this->assertTrue($marta['certificate_valid']);
        $progress = ProgressAggregator::for($this->people['marta']);
        $this->assertSame($progress['courses_done'], $marta['courses_done']);
        $this->assertSame(1, $marta['courses_total']);

        $ola = $rows->get($this->people['ola']->id);
        $this->assertTrue($ola['certificate_issued'], 'Stare pole liczy każdy certyfikat.');
        $this->assertFalse($ola['certificate_valid'], 'Unieważniony certyfikat nie jest ważny.');
        $this->assertNull($ola['workshop_completed_at']);

        $filip = $rows->get($this->people['filip']->id);
        $this->assertSame('student', $filip['role']);
        $this->assertNull($filip['internship'], 'Studenta staż nie dotyczy.');
        $this->assertNull($filip['supervision'], 'Studenta superwizje nie dotyczą.');

        $tomek = $rows->get($this->people['tomek']->id);
        $this->assertSame('0', $tomek['hours_accepted'], 'Dyżur poza okresem nie wchodzi do godzin w okresie.');
        $this->assertSame(['done' => '3', 'required' => '72'], $tomek['internship'], 'Staż „ile z ilu” to stan dziś.');

        $this->assertCount(6, $rows, 'Zestawienie: wolontariusze i studenci, bez personelu.');
    }

    public function test_the_full_breakdown_file_has_polish_headers_and_not_applicable_for_students(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->get('/api/v1/admin/report/export.csv?uklad=zestawienie&from='.self::FROM.'&to='.self::TO);
        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=utf-8');
        $csv = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString(
            '"Numer osoby";Imię;Nazwisko;Rola;"Stan konta";"Kursy ukończone";"Kursy w ścieżce";'
                .'"Staż: godziny zaakceptowane";"Staż: godziny wymagane";"Superwizje: obecności";"Superwizje: wymagane";'
                .'"Warsztat zaliczony";"Godziny dyżurów w okresie";"Konsultacje w okresie";"Certyfikat (bez unieważnionych)"',
            $csv,
        );
        $this->assertStringContainsString(
            $this->people['marta']->id.';Marta;Demo;Wolontariusz;aktywne;',
            $csv,
        );
        $this->assertStringContainsString(';10,5;72;2;6;2026-03-20;4,5;3;tak', $csv);
        $this->assertStringContainsString(
            $this->people['filip']->id.';Filip;Demo;Student;aktywne;',
            $csv,
        );
        $this->assertMatchesRegularExpression('/;Filip;Demo;Student;aktywne;\d+;1;"nie dotyczy";"nie dotyczy";"nie dotyczy";"nie dotyczy";nie;5;2;nie/', $csv);
        $this->assertStringNotContainsString('Joanna', $csv);
    }

    public function test_the_default_export_file_is_unchanged(): void
    {
        $this->actingAsRole('super_admin');

        $csv = $this->get('/api/v1/admin/report/export.csv')->assertOk()->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF".'id;first_name;last_name;role;hours_accepted;consultations;certificate_issued', $csv);
    }

    public function test_an_unknown_file_layout_and_an_inverted_range_are_rejected_with_plain_sentences(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/v1/admin/report/export.csv?uklad=inny')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->getJson('/api/v1/admin/report?from=2026-03-31&to=2026-03-01')
            ->assertStatus(422)
            ->assertJsonPath('error.errors.to.0', 'Data końca nie może być wcześniejsza niż data początku.');
    }

    public function test_the_breakdown_file_keeps_the_administration_only_rule(): void
    {
        $this->actingAsRole('volunteer');

        $this->get('/api/v1/admin/report/export.csv?uklad=zestawienie')->assertStatus(403);
    }

    private function entry(string $person, string $date, string $hours, int $consultations, string $status = 'accepted'): void
    {
        InternshipEntry::create([
            'user_id' => $this->people[$person]->id,
            'date' => $date,
            'hours' => $hours,
            'form' => 'phone_duty',
            'consultations_count' => $consultations,
            'description' => 'Dyżur próbny — bez danych osób konsultowanych.',
            'status' => $status,
        ]);
    }
}
