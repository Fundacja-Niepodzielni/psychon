<?php

namespace Tests\Feature\H20;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Document;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\LegalDocumentVersion;
use App\Models\Lesson;
use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
use App\Models\SupervisionSlot;
use App\Models\Test as KnowledgeTest;
use App\Models\TestAttempt;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H20 · dziennik działań — „kogo dotyczy”, grupy, filtry po osobie, której
 * wpis dotyczy, i po wykonawcy, strony oraz eksport w kolumnach ekranu.
 *
 * „Kogo dotyczy” to osoba (z identyfikatorem konta do karty osoby) albo nazwa
 * rzeczy (tytuł kursu), nigdy typ techniczny i numer. Rzecz należąca do osoby
 * (wpis stażu, podejście do testu, dokument, certyfikat…) dotyczy tej osoby —
 * także w filtrze `subject_user_id`. Dane testowe są zmyślone, nazwiska jak
 * w pozostałych testach („Demo”).
 */
class AuditSubjectsTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private User $admin;

    private User $marta;

    private User $filip;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->actingAsRole('super_admin', ['first_name' => 'Anna', 'last_name' => 'Opiekun']);
        $this->marta = User::factory()->create(['role' => 'volunteer', 'first_name' => 'Marta', 'last_name' => 'Demo']);
        $this->filip = User::factory()->create(['role' => 'volunteer', 'first_name' => 'Filip', 'last_name' => 'Demo']);
    }

    public function test_entry_about_a_person_names_the_person_with_the_account_id(): void
    {
        AuditLog::record($this->admin, 'user.blocked', $this->marta, ['reason' => 'Powód wpisany ręcznie.']);

        $entry = $this->getJson('/api/v1/admin/audit')->assertOk()->json('data.0');

        $this->assertSame(
            ['person' => ['id' => $this->marta->id, 'first_name' => 'Marta', 'last_name' => 'Demo'], 'label' => null],
            $entry['subject'],
        );
        $this->assertSame(['key' => 'konta', 'label' => 'Konta i role'], $entry['group']);
    }

    public function test_things_that_belong_to_a_person_name_that_person_and_the_thing(): void
    {
        $edition = Edition::factory()->create();
        $course = Course::create(['title' => 'Interwencja kryzysowa', 'slug' => 'dziennik-interwencja']);
        $test = KnowledgeTest::create(['course_id' => $course->id, 'question_count' => 10]);

        $entry = $this->unguarded(fn () => InternshipEntry::create([
            'user_id' => $this->marta->id, 'date' => '2026-08-27', 'hours' => '3.5', 'form' => 'phone_duty',
            'consultations_count' => 4, 'status' => 'submitted',
        ]));
        $attempt = $this->unguarded(fn () => TestAttempt::create([
            'user_id' => $this->marta->id, 'test_id' => $test->id, 'attempt_number' => 1,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 90, 'passed' => true,
        ]));
        $certificate = $this->unguarded(fn () => Certificate::create([
            'user_id' => $this->marta->id, 'edition_id' => $edition->id, 'number' => 'NP/2026/901', 'issued_at' => now(),
            'verification_token' => 'weryfikacja-demo-901',
        ]));
        $document = $this->unguarded(fn () => Document::create([
            'user_id' => $this->marta->id, 'edition_id' => $edition->id, 'type' => 'volunteer_agreement', 'number' => 'PW/2026/901',
        ]));
        $profile = $this->unguarded(fn () => PsychologistProfile::create(['user_id' => $this->marta->id, 'status' => 'submitted']));
        $profileDocument = $this->unguarded(fn () => ProfileDocument::create([
            'profile_id' => $profile->id, 'type' => 'dyplom', 'file_path' => 'profile/dyplom-demo.pdf',
        ]));
        $assignment = $this->unguarded(fn () => CourseAssignment::create([
            'course_id' => $course->id, 'instructor_id' => $this->filip->id, 'assigned_by' => $this->admin->id, 'assigned_at' => now(),
        ]));
        $slot = $this->unguarded(fn () => SupervisionSlot::create([
            'supervisor_id' => $this->filip->id, 'starts_at' => now()->addWeek(), 'duration_minutes' => 60, 'seats_limit' => 6,
        ]));

        $expected = [
            'internship.accepted' => [$entry, $this->marta, 'Wpis w dzienniku stażu'],
            'attempt.finished' => [$attempt, $this->marta, 'Test w kursie „Interwencja kryzysowa”'],
            'certificate.issued' => [$certificate, $this->marta, 'Certyfikat'],
            'document.generated' => [$document, $this->marta, 'Porozumienie wolontariackie'],
            'profile.accepted' => [$profile, $this->marta, 'Profil psychologa'],
            'sensitive.viewed' => [$profileDocument, $this->marta, 'Dokument profilu psychologa'],
            'assignment.created' => [$assignment, $this->filip, 'Interwencja kryzysowa'],
            'supervision.slot_cancelled' => [$slot, $this->filip, 'Termin superwizji'],
        ];

        foreach ($expected as $action => [$subject]) {
            AuditLog::record($this->admin, $action, $subject);
        }

        $data = collect($this->getJson('/api/v1/admin/audit')->assertOk()->json('data'))->keyBy('action');

        foreach ($expected as $action => [, $person, $label]) {
            $this->assertSame(
                ['person' => ['id' => $person->id, 'first_name' => $person->first_name, 'last_name' => $person->last_name], 'label' => $label],
                $data[$action]['subject'],
                "Kogo dotyczy: {$action}",
            );
        }
    }

    public function test_entries_about_courses_and_settings_name_the_thing_and_no_person(): void
    {
        $edition = Edition::factory()->create(['name' => 'Edycja demo']);
        $course = Course::create(['title' => 'Podstawy pomocy psychologicznej', 'slug' => 'dziennik-podstawy']);
        $lesson = $this->unguarded(fn () => Lesson::create(['course_id' => $course->id, 'title' => 'Wprowadzenie do rozmowy']));
        $legal = $this->unguarded(fn () => LegalDocumentVersion::create([
            'type' => 'regulamin', 'version' => 'v2', 'content' => 'Treść demo.', 'status' => 'published',
        ]));

        AuditLog::record($this->admin, 'course.created', $course);
        AuditLog::record($this->admin, 'course.updated', $course, ['op' => 'lesson.updated', 'lesson_id' => $lesson->id]);
        AuditLog::record($this->admin, 'course.updated', null, ['op' => 'courses.reordered']);
        AuditLog::record($this->admin, 'edition.updated', $edition);
        AuditLog::record($this->admin, 'legal_document.published', $legal);
        AuditLog::record($this->admin, 'user.created', $lesson);

        $labels = collect($this->getJson('/api/v1/admin/audit')->assertOk()->json('data'))
            ->map(fn (array $row): array => [$row['action'], $row['subject']['person'], $row['subject']['label']])
            ->reverse()->values()->all();

        $this->assertSame([
            ['course.created', null, 'Podstawy pomocy psychologicznej'],
            ['course.updated', null, 'Podstawy pomocy psychologicznej · lekcja „Wprowadzenie do rozmowy”'],
            ['course.updated', null, 'Kolejność kursów'],
            ['edition.updated', null, 'Edycja Edycja demo'],
            ['legal_document.published', null, 'Regulamin, wersja v2'],
            // Typ podmiotu, którego słownik nie zna: nazwa ogólna, nigdy klasa i numer.
            ['user.created', null, 'Inny obiekt systemu'],
        ], $labels);
    }

    public function test_application_without_an_account_names_the_applicant_without_a_card_link(): void
    {
        $rejected = Application::factory()->create(['first_name' => 'Ola', 'last_name' => 'Demo', 'user_id' => null]);
        $accepted = Application::factory()->create(['first_name' => 'Marta', 'last_name' => 'Demo', 'user_id' => $this->marta->id]);

        AuditLog::record($this->admin, 'application.rejected', $rejected);
        AuditLog::record($this->admin, 'application.accepted', $accepted);

        $data = collect($this->getJson('/api/v1/admin/audit')->assertOk()->json('data'))->keyBy('action');

        $this->assertSame(
            ['person' => ['id' => null, 'first_name' => 'Ola', 'last_name' => 'Demo'], 'label' => 'Zgłoszenie rekrutacyjne'],
            $data['application.rejected']['subject'],
        );
        $this->assertSame($this->marta->id, $data['application.accepted']['subject']['person']['id']);
    }

    public function test_filter_by_the_person_concerned_includes_things_that_belong_to_them(): void
    {
        $entry = $this->unguarded(fn () => InternshipEntry::create([
            'user_id' => $this->marta->id, 'date' => '2026-08-27', 'hours' => '2', 'form' => 'chat_duty',
            'consultations_count' => 0, 'status' => 'submitted',
        ]));

        $aboutMarta = AuditLog::record($this->admin, 'access.extended', $this->marta);
        $herEntry = AuditLog::record($this->admin, 'internship.returned', $entry);
        AuditLog::record($this->admin, 'access.extended', $this->filip);
        // Marta jako wykonawca — wpis dotyczy Filipa, więc nie wchodzi do filtra „dotyczy Marty”.
        AuditLog::record($this->marta, 'user.updated', $this->filip);

        $ids = collect($this->getJson("/api/v1/admin/audit?subject_user_id={$this->marta->id}")->assertOk()->json('data'))
            ->pluck('id')->all();

        $this->assertSame([$herEntry->id, $aboutMarta->id], $ids);
    }

    public function test_search_by_name_for_the_person_concerned_and_for_the_actor(): void
    {
        $ola = Application::factory()->create(['first_name' => 'Ola', 'last_name' => 'Przykładowa', 'user_id' => null]);

        $aboutMarta = AuditLog::record($this->admin, 'user.blocked', $this->marta);
        AuditLog::record($this->admin, 'user.blocked', $this->filip);
        $aboutOla = AuditLog::record($this->admin, 'application.rejected', $ola);
        $byFilip = AuditLog::record($this->filip, 'cooperation_request.created', null);

        $this->assertSame(
            [$aboutMarta->id],
            collect($this->getJson('/api/v1/admin/audit?subject_search=marta%20demo')->json('data'))->pluck('id')->all(),
        );
        $this->assertSame(
            [$aboutOla->id],
            collect($this->getJson('/api/v1/admin/audit?subject_search=PRZYKŁADOWA')->json('data'))->pluck('id')->all(),
        );
        $this->assertSame(
            [$byFilip->id],
            collect($this->getJson('/api/v1/admin/audit?actor_search=Filip')->json('data'))->pluck('id')->all(),
        );
        // `%` w frazie jest znakiem, nie wzorcem.
        $this->assertSame([], $this->getJson('/api/v1/admin/audit?actor_search=%25')->json('data'));
    }

    public function test_filter_by_group(): void
    {
        $blocked = AuditLog::record($this->admin, 'user.blocked', $this->marta);
        AuditLog::record($this->admin, 'workshop.completed', $this->marta);

        $response = $this->getJson('/api/v1/admin/audit?group=konta')->assertOk();

        $this->assertSame([$blocked->id], collect($response->json('data'))->pluck('id')->all());
        $this->getJson('/api/v1/admin/audit?group=nieznana')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_date_only_end_of_range_includes_the_whole_last_day(): void
    {
        $this->travelTo(now()->setDate(2026, 9, 30)->setTime(18, 0));
        $lastDay = AuditLog::record($this->admin, 'user.blocked', $this->marta);
        $this->travelTo(now()->setDate(2026, 10, 1)->setTime(0, 30));
        $nextDay = AuditLog::record($this->admin, 'user.blocked', $this->filip);
        $this->travelBack();

        $ids = collect($this->getJson('/api/v1/admin/audit?from=2026-09-30&to=2026-09-30')->json('data'))->pluck('id')->all();

        $this->assertSame([$lastDay->id], $ids);
        $this->assertNotContains($nextDay->id, $ids);
    }

    public function test_pagination_has_a_total_and_reaches_the_last_page(): void
    {
        foreach (range(1, 30) as $_) {
            AuditLog::record($this->admin, 'user.updated', $this->marta);
        }

        $first = $this->getJson('/api/v1/admin/audit?per_page=25')->assertOk();
        $this->assertSame(['current_page' => 1, 'per_page' => 25, 'total' => 30, 'last_page' => 2], $first->json('meta'));
        $this->assertCount(25, $first->json('data'));

        $last = $this->getJson('/api/v1/admin/audit?per_page=25&page=2')->assertOk();
        $this->assertCount(5, $last->json('data'));

        $this->getJson('/api/v1/admin/audit?per_page=101')->assertStatus(422);
        $this->getJson('/api/v1/admin/audit?page=0')->assertStatus(422);
    }

    public function test_export_has_the_screen_columns_readable_values_and_the_same_filters(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 2)->setTime(12, 5));
        AuditLog::record($this->admin, 'user.blocked', $this->marta, ['reason' => 'Powód wpisany ręcznie.']);
        AuditLog::record($this->admin, 'user.blocked', $this->filip, ['reason' => 'Inny powód.']);
        $course = Course::create(['title' => 'Interwencja kryzysowa', 'slug' => 'dziennik-eksport']);
        AuditLog::record(null, 'course.created', $course);
        $this->travelBack();

        $body = $this->get("/api/v1/admin/audit/export.csv?subject_user_id={$this->marta->id}")
            ->assertOk()
            ->streamedContent();

        $this->assertSame(
            "\xEF\xBB\xBFKiedy;Rodzaj;Co;\"Kogo dotyczy\";Kto\n"
            ."\"2 października 2026, 14:05\";\"Konta i role\";\"Zablokowano konto\";\"Marta Demo\";\"Anna Opiekun\"\n",
            $body,
        );

        $all = $this->get('/api/v1/admin/audit/export.csv')->assertOk()->streamedContent();
        $this->assertStringContainsString(';"Kursy i testy";"Utworzono kurs";"Interwencja kryzysowa";System'."\n", $all);
        // Bez ładunku: ani powód wpisany ręcznie, ani kod techniczny, ani typ i numer podmiotu.
        $this->assertStringNotContainsString('Powód wpisany ręcznie', $all);
        $this->assertStringNotContainsString('user.blocked', $all);
        $this->assertStringNotContainsString('User #', $all);
    }

    public function test_export_neutralises_a_formula_in_the_names(): void
    {
        $formula = User::factory()->create(['role' => 'volunteer', 'first_name' => '=HYPERLINK("x")', 'last_name' => '@SUM(1)']);
        AuditLog::record($formula, 'user.updated', $formula);

        $body = $this->get('/api/v1/admin/audit/export.csv')->assertOk()->streamedContent();

        $this->assertStringContainsString(
            ';"Zmieniono dane konta";"\'=HYPERLINK(""x"") @SUM(1)";"\'=HYPERLINK(""x"") @SUM(1)"'."\n",
            $body,
        );
        $this->assertStringNotContainsString('"=HYPERLINK(', $body);
    }

    public function test_listing_reads_subjects_in_batches_not_row_by_row(): void
    {
        foreach (range(1, 10) as $i) {
            $person = User::factory()->create(['role' => 'volunteer']);
            $entry = $this->unguarded(fn () => InternshipEntry::create([
                'user_id' => $person->id, 'date' => '2026-08-27', 'hours' => '1', 'form' => 'other',
                'consultations_count' => $i, 'status' => 'submitted',
            ]));
            AuditLog::record($this->admin, 'internship.accepted', $entry);
            AuditLog::record($this->admin, 'user.updated', $person);
        }

        DB::enableQueryLog();
        $this->getJson('/api/v1/admin/audit')->assertOk();
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        // Uwierzytelnienie, odczyt strony, licznik, wykonawcy, jedna paczka na typ podmiotu, osoby —
        // stała liczba, niezależna od 20 wierszy na stronie.
        $this->assertLessThanOrEqual(12, $queries);
    }

    public function test_entry_keeps_the_fields_the_previous_screen_reads(): void
    {
        AuditLog::record($this->admin, 'user.created', $this->marta, ['role' => 'volunteer']);

        $entry = $this->getJson('/api/v1/admin/audit')->assertOk()->json('data.0');

        $this->assertSame('User', $entry['subject_type']);
        $this->assertSame($this->marta->id, $entry['subject_id']);
        $this->assertArrayHasKey('details', $entry);
        $this->assertSame(1, AuditLogEntry::query()->count());
    }

    /**
     * @template T of Model
     *
     * @param  callable(): T  $create
     * @return T
     */
    private function unguarded(callable $create): Model
    {
        return Model::unguarded($create);
    }
}
