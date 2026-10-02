<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\Material;
use App\Models\Test;
use App\Models\User;
use App\Services\H17\QuestionRouting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Pola odczytu dla ekranu lekcji:
 *  - `GET /lessons/{id}`: `course`, `question_addressee`, `required_active_seconds`,
 *  - `POST /lessons/{id}/progress`: `required_active_seconds`,
 *  - `GET /courses/{slug}`: `has_test` i `materials[].mime`.
 *
 * Żadne z tych pól nie zmienia reguły dostępu ani reguły ukończenia; testy
 * pilnują tego wprost. Dostawcę nagrań zastępuje atrapa.
 */
class LessonReadFieldsTest extends TestCase
{
    use RefreshDatabase;

    private const string RECORDING = 'mock-nagranie-pola';

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake();
    }

    // ------------------------------------------------------------------
    // course
    // ------------------------------------------------------------------

    public function test_the_lesson_read_names_its_course(): void
    {
        $course = $this->course(1, 'Kurs pól odczytu', 'kurs-pol-odczytu');
        $lesson = $this->lesson($course);
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();

        $this->assertSame(
            ['id' => $course->id, 'slug' => 'kurs-pol-odczytu', 'title' => 'Kurs pól odczytu'],
            $response->json('data.course'),
        );
        $this->assertSame(['id', 'slug', 'title'], array_keys($response->json('data.course')));
        $this->assertIsInt($response->json('data.course.id'));
    }

    public function test_the_course_field_opens_nothing_a_locked_course_still_refuses_with_no_course_data(): void
    {
        $first = $this->course(1, 'Etap pierwszy', 'etap-pierwszy');
        $this->lesson($first);
        $second = $this->course(2, 'Etap drugi', 'etap-drugi');
        $locked = $this->lesson($second);
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$locked->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');

        $this->assertNull($response->json('data'));
        $this->assertStringNotContainsString('etap-drugi', (string) $response->getContent());
    }

    public function test_a_missing_lesson_and_a_guest_get_no_course_data(): void
    {
        $course = $this->course(1, 'Kurs pól odczytu', 'kurs-pol-odczytu');
        $lesson = $this->lesson($course);

        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertStatus(401);

        $this->actingAs($this->volunteer(), 'keycloak');
        $this->getJson('/api/v1/lessons/99999999')->assertStatus(404)->assertJsonPath('error.code', 'not_found');
    }

    // ------------------------------------------------------------------
    // question_addressee
    // ------------------------------------------------------------------

    public function test_the_addressee_is_the_course_instructor_when_the_lesson_has_no_own_assignment(): void
    {
        $course = $this->course(1, 'Kurs', 'kurs-adresat');
        $lesson = $this->lesson($course);
        $courseInstructor = $this->instructor('Marta', 'Zielińska');
        $this->assign($course, null, $courseInstructor);
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();

        $this->assertSame(['name' => 'Marta Zielińska'], $response->json('data.question_addressee'));
    }

    public function test_the_lesson_assignment_wins_over_the_course_assignment(): void
    {
        $course = $this->course(1, 'Kurs', 'kurs-adresat');
        $lesson = $this->lesson($course);
        $other = $this->lesson($course, 2);
        $this->assign($course, null, $this->instructor('Marta', 'Zielińska'));
        $this->assign($course, $lesson, $this->instructor('Jan', 'Wiśniewski'));
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.question_addressee.name', 'Jan Wiśniewski');
        // Lekcja bez własnego przypisania dziedziczy po kursie (druga lekcja
        // otwiera się po ukończeniu pierwszej).
        $this->completeLesson($user, $lesson);
        $this->getJson("/api/v1/lessons/{$other->id}")
            ->assertOk()
            ->assertJsonPath('data.question_addressee.name', 'Marta Zielińska');
    }

    public function test_the_addressee_is_null_without_an_active_assignment_and_after_the_assignment_ends(): void
    {
        $course = $this->course(1, 'Kurs', 'kurs-adresat');
        $lesson = $this->lesson($course);
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();
        $this->assertArrayHasKey('question_addressee', $response->json('data'));
        $this->assertNull($response->json('data.question_addressee'));

        $assignment = $this->assign($course, null, $this->instructor('Marta', 'Zielińska'));
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.question_addressee.name', 'Marta Zielińska');

        $assignment->update(['unassigned_at' => now()]);
        $this->assertNull($this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->json('data.question_addressee'));
    }

    public function test_the_addressee_carries_only_the_name_and_matches_the_question_routing(): void
    {
        $course = $this->course(1, 'Kurs', 'kurs-adresat');
        $lesson = $this->lesson($course);
        $instructor = $this->instructor('Marta', 'Zielińska');
        $this->assign($course, null, $instructor);
        $this->actingAs($this->volunteer(), 'keycloak');

        $addressee = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->json('data.question_addressee');

        $this->assertSame(['name'], array_keys($addressee));
        $this->assertSame(
            QuestionRouting::forLesson($lesson)->fullName(),
            $addressee['name'],
            'Odczyt i zapis pytania wyznacza adresata jedną regułą.',
        );
        $this->assertStringNotContainsString($instructor->email, (string) json_encode($addressee));
    }

    // ------------------------------------------------------------------
    // required_active_seconds
    // ------------------------------------------------------------------

    /**
     * Czas trwania 601 s i próg 60% dają ceil(360.6) = 361 s.
     *
     * @return array<string, array{?string, int, int, bool}> played, duration, percent, expected
     */
    public static function requiredSeconds(): array
    {
        return [
            'ready, 600 s at 60%' => [self::RECORDING, 600, 60, 360],
            'ready, 601 s at 60% rounds up' => [self::RECORDING, 601, 60, 361],
            'ready, 600 s at 80%' => [self::RECORDING, 600, 80, 480],
            'ready, 1 s at 60% rounds up to 1' => [self::RECORDING, 1, 60, 1],
        ];
    }

    #[DataProvider('requiredSeconds')]
    public function test_required_active_seconds_is_the_exact_point_where_completable_flips(
        ?string $played,
        int $duration,
        int $percent,
        int $expected,
    ): void {
        $this->edition(['lesson_completion_percent' => $percent]);
        $lesson = $this->lesson($this->course(1, 'Kurs', 'kurs-czas'), 1, $duration, $played, 'ready');
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        $read = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();
        $this->assertSame($expected, $read->json('data.required_active_seconds'));
        $this->assertIsInt($read->json('data.required_active_seconds'));
        $this->assertSame($percent, $read->json('data.completable_at_percent'));

        // Tuż pod progiem: nie do ukończenia; równo na progu: do ukończenia.
        $this->setActive($user, $lesson, $expected - 1);
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.completable', false);
        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", ['watched_delta' => 0, 'active_delta' => 0])
            ->assertOk()
            ->assertJsonPath('data.completable', false)
            ->assertJsonPath('data.required_active_seconds', $expected);
        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertStatus(422);

        $this->setActive($user, $lesson, $expected);
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.completable', true);
        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", ['watched_delta' => 0, 'active_delta' => 0])
            ->assertOk()
            ->assertJsonPath('data.completable', true)
            ->assertJsonPath('data.required_active_seconds', $expected);
        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertOk();
    }

    public function test_a_lesson_without_a_recording_requires_no_active_time(): void
    {
        $lesson = $this->lesson($this->course(1, 'Kurs', 'kurs-czas'), 1, 900, null, null);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.video_status', 'none')
            ->assertJsonPath('data.required_active_seconds', 0)
            ->assertJsonPath('data.completable', true);
        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", ['watched_delta' => 0, 'active_delta' => 0])
            ->assertOk()
            ->assertJsonPath('data.required_active_seconds', 0)
            ->assertJsonPath('data.completable', true);
    }

    public function test_a_recording_lesson_with_zero_duration_requires_zero_and_is_never_completable(): void
    {
        $lesson = $this->lesson($this->course(1, 'Kurs', 'kurs-czas'), 1, 0, self::RECORDING, 'ready');
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.required_active_seconds', 0)
            ->assertJsonPath('data.completable', false);
    }

    public function test_a_recording_in_preparation_keeps_the_formula_value_but_is_not_completable(): void
    {
        $lesson = $this->lesson($this->course(1, 'Kurs', 'kurs-czas'), 1, 600, null, 'processing', '3fa85f64-5717-4562-b3fc-2c963f66afa6');
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.video_status', 'processing')
            ->assertJsonPath('data.required_active_seconds', 360)
            ->assertJsonPath('data.completable', false);
    }

    // ------------------------------------------------------------------
    // has_test, materials[].mime
    // ------------------------------------------------------------------

    public function test_the_course_read_says_whether_the_course_has_a_test(): void
    {
        $withTest = $this->course(1, 'Z testem', 'z-testem');
        $this->lesson($withTest);
        Test::create(['course_id' => $withTest->id, 'pass_threshold' => null, 'attempts_limit' => null, 'question_count' => 0]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->assertTrue($this->getJson('/api/v1/courses/z-testem')->assertOk()->json('data.has_test'));
    }

    public function test_the_course_read_says_a_course_without_a_test_has_none(): void
    {
        $this->lesson($this->course(1, 'Bez testu', 'bez-testu'));
        $this->actingAs($this->volunteer(), 'keycloak');

        $data = $this->getJson('/api/v1/courses/bez-testu')->assertOk()->json('data');

        $this->assertArrayHasKey('has_test', $data);
        $this->assertFalse($data['has_test']);
    }

    public function test_the_course_list_item_does_not_gain_has_test(): void
    {
        $this->lesson($this->course(1, 'Bez testu', 'bez-testu'));
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->assertArrayNotHasKey('has_test', $this->getJson('/api/v1/courses')->assertOk()->json('data.0'));
    }

    public function test_a_material_carries_its_mime_or_null(): void
    {
        $course = $this->course(1, 'Materiały', 'materialy');
        $lesson = $this->lesson($course);
        Material::create(['lesson_id' => $lesson->id, 'name' => 'Karta', 'file_path' => 'm/a', 'mime' => 'application/pdf', 'size' => 10]);
        Material::create(['course_id' => $course->id, 'name' => 'Bez typu', 'file_path' => 'm/b', 'mime' => null, 'size' => 20]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $materials = $this->getJson('/api/v1/courses/materialy')->assertOk()->json('data.materials');

        $this->assertSame(['id', 'name', 'size', 'mime', 'lesson_id', 'download_url'], array_keys($materials[0]));
        $this->assertSame(['application/pdf', null], array_column($materials, 'mime'));
    }

    // ------------------------------------------------------------------
    // liczba zapytań nie rośnie z liczbą elementów
    // ------------------------------------------------------------------

    public function test_the_query_count_of_both_reads_does_not_grow_with_lessons_and_materials(): void
    {
        $counts = [];
        $user = $this->volunteer();

        foreach ([1, 6] as $n) {
            $course = $this->course(1, 'Kurs '.$n, 'kurs-zapytan-'.$n);
            Test::create(['course_id' => $course->id, 'pass_threshold' => null, 'attempts_limit' => null, 'question_count' => 0]);
            $this->assign($course, null, $this->instructor('Marta', 'Zielińska'.$n));
            $first = null;

            for ($i = 1; $i <= $n; $i++) {
                $lesson = $this->lesson($course, $i);
                $first ??= $lesson;
                Material::create(['lesson_id' => $lesson->id, 'name' => 'M'.$i, 'file_path' => 'm/'.$i, 'mime' => 'application/pdf', 'size' => 1]);
            }

            $this->actingAs($user, 'keycloak');

            foreach (['lesson' => "/api/v1/lessons/{$first->id}", 'course' => "/api/v1/courses/kurs-zapytan-{$n}"] as $label => $url) {
                $this->getJson($url)->assertOk();
                DB::flushQueryLog();
                DB::enableQueryLog();
                $this->getJson($url)->assertOk();
                $counts[$label][$n] = count(DB::getQueryLog());
                DB::disableQueryLog();
            }
        }

        $this->assertSame($counts['lesson'][1], $counts['lesson'][6], 'Odczyt lekcji: liczba zapytań nie zależy od liczby lekcji i materiałów.');
        $this->assertSame($counts['course'][1], $counts['course'][6], 'Odczyt kursu: liczba zapytań nie zależy od liczby lekcji i materiałów.');
    }

    // ------------------------------------------------------------------
    // pomocnicze
    // ------------------------------------------------------------------

    private function completeLesson(User $user, Lesson $lesson): void
    {
        DB::table('lesson_progress')->updateOrInsert(
            ['user_id' => $user->id, 'lesson_id' => $lesson->id],
            [
                'position_seconds' => 0, 'watched_seconds' => 600, 'active_seconds' => 600,
                'open_count' => 1, 'last_activity_at' => null, 'is_completed' => true, 'completed_at' => now(),
                'created_at' => now(), 'updated_at' => now(),
            ],
        );
    }

    private function setActive(User $user, Lesson $lesson, int $active): void
    {
        DB::table('lesson_progress')->updateOrInsert(
            ['user_id' => $user->id, 'lesson_id' => $lesson->id],
            [
                'position_seconds' => 0, 'watched_seconds' => $active, 'active_seconds' => $active,
                'open_count' => 0, 'last_activity_at' => null, 'is_completed' => false, 'completed_at' => null,
                'created_at' => now(), 'updated_at' => now(),
            ],
        );
    }

    private function assign(Course $course, ?Lesson $lesson, User $instructor): CourseAssignment
    {
        return CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => $lesson?->id,
            'instructor_id' => $instructor->id,
            'assigned_by' => $instructor->id,
            'assigned_at' => now(),
        ]);
    }

    private function course(int $order, string $title, string $slug): Course
    {
        return Course::create([
            'title' => $title,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
        ]);
    }

    private function lesson(
        Course $course,
        int $order = 1,
        int $duration = 600,
        ?string $played = self::RECORDING,
        ?string $status = 'ready',
        ?string $pending = null,
    ): Lesson {
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja '.$order,
            'sequence_order' => $order,
            'duration_seconds' => $duration,
        ]);

        DB::table('lessons')->where('id', $lesson->id)->update([
            // Identyfikator nagrania jest niepowtarzalny w bazie — każda lekcja ma własny.
            'video_provider_id' => $played === self::RECORDING ? 'mock-nagranie-'.$lesson->id : $played,
            'video_pending_id' => $pending,
            'video_status' => $status,
            'video_status_at' => $status === null ? null : now(),
        ]);

        return $lesson->fresh();
    }

    /** @param  array<string, mixed>  $overrides */
    private function edition(array $overrides = []): Edition
    {
        $edition = Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja pól odczytu',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);

        if ($overrides !== []) {
            $edition->update($overrides);
        }

        return $edition;
    }

    private function instructor(string $first, string $last): User
    {
        return User::factory()->create(['role' => 'instructor', 'first_name' => $first, 'last_name' => $last]);
    }

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }
}
