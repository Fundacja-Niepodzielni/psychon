<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Identyfikator nagrania lekcji (`video_provider_id`) bez rozróżniania wielkości
 * liter i bez białych znaków na brzegach: zapis zamienia go na małe litery,
 * a reguła „już przypisany" i indeks bazy porównują postać znormalizowaną.
 * Wszystko idzie przez pełny stos tras. Dostawca nagrań jest wyłącznie
 * podróbką (`Http::fake`) — żadne żądanie nie opuszcza procesu.
 *
 * Wyścig dwóch zapisów udają zdarzenia modelu: konkurent wstawia ten sam
 * identyfikator tuż po przejściu reguły żądania, a przed zapisem lekcji. Obie
 * strony są na jednym połączeniu, więc wstawiony wiersz cofa się razem z
 * odrzuconym zapisem — sprawdzany jest kształt odmowy i brak skutku lekcji.
 */
class AdminLessonRecordingCaseTest extends TestCase
{
    use RefreshDatabase;

    private const string TAKEN_MESSAGE = 'Ten identyfikator nagrania jest już przypisany do innej lekcji.';

    private const string HELD_ID = 'mock-zajete-nagranie';

    private const string OWN_ID = 'mock-wlasne-nagranie';

    private const string LEGACY_ID = 'MOCK-STARE-NAGRANIE';

    private const string LIBRARY = 'test-library';

    private const string API_KEY = 'test-api-key';

    /** @return array<string, array{string}> */
    public static function administrationRoles(): array
    {
        return [
            'super admin' => ['super_admin'],
            'project manager' => ['project_manager'],
        ];
    }

    /** @return array<string, array{string}> */
    public static function variantsOfTheHeldId(): array
    {
        return [
            'upper case' => ['MOCK-ZAJETE-NAGRANIE'],
            'mixed case' => ['Mock-Zajete-Nagranie'],
            'white space around' => ['  mock-zajete-nagranie  '],
            'tab and new line around' => ["\tmock-zajete-nagranie\n"],
            'upper case and white space' => [' MOCK-ZAJETE-NAGRANIE '],
        ];
    }

    /** @return array<string, array{string, string}> */
    public static function typedIdsAndTheirStoredForm(): array
    {
        return [
            'upper case' => ['MOCK-NOWE-NAGRANIE', 'mock-nowe-nagranie'],
            'mixed case' => ['Mock-Nowe-Nagranie', 'mock-nowe-nagranie'],
            'upper case guid' => ['3FA85F64-5717-4562-B3FC-2C963F66AFA6', '3fa85f64-5717-4562-b3fc-2c963f66afa6'],
            'white space around' => ['  mock-nowe-nagranie  ', 'mock-nowe-nagranie'],
            'upper case and white space' => [' MOCK-NOWE-NAGRANIE ', 'mock-nowe-nagranie'],
        ];
    }

    /** @return array<string, array{string}> */
    public static function guidsHeldByAnotherLesson(): array
    {
        return [
            'the same letters' => [self::HELD_ID],
            'other letter case' => ['MOCK-ZAJETE-NAGRANIE'],
        ];
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_cannot_create_a_lesson_with_an_id_held_in_another_letter_case(string $role): void
    {
        $course = $this->course('etap-1');
        $holder = $this->lesson($course, 1, self::HELD_ID);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => 'MOCK-ZAJETE-NAGRANIE',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(1, Lesson::where('course_id', $course->id)->count());
        $this->assertSame(self::HELD_ID, $holder->fresh()->video_provider_id);
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_cannot_change_a_lesson_to_an_id_held_in_another_letter_case(string $role): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $holder = $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Tytuł, który nie może się zapisać',
            'video_provider_id' => 'MOCK-ZAJETE-NAGRANIE',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $fresh = $lesson->fresh();
        $this->assertSame(self::OWN_ID, $fresh->video_provider_id);
        $this->assertSame('Lekcja z nagraniem', $fresh->title);
        $this->assertSame(self::HELD_ID, $holder->fresh()->video_provider_id);
    }

    #[DataProvider('variantsOfTheHeldId')]
    public function test_a_held_id_differing_only_by_case_or_white_space_is_refused_on_create(string $variant): void
    {
        $course = $this->course('etap-1');
        $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $variant,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
    }

    #[DataProvider('variantsOfTheHeldId')]
    public function test_a_held_id_differing_only_by_case_or_white_space_is_refused_on_save(string $variant): void
    {
        $lesson = $this->lesson($this->course('etap-1'), 1, self::OWN_ID);
        $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => $variant])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(self::OWN_ID, $lesson->fresh()->video_provider_id);
    }

    #[DataProvider('typedIdsAndTheirStoredForm')]
    public function test_administration_stores_a_new_lesson_id_in_lower_case(string $typed, string $stored): void
    {
        $course = $this->course('etap-1');
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $created = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $typed,
        ])
            ->assertCreated()
            ->assertJsonPath('data.video_provider_id', $stored);

        $this->assertSame($stored, Lesson::findOrFail($created->json('data.id'))->video_provider_id);
        $this->assertSame(
            $stored,
            DB::table('lessons')->where('id', $created->json('data.id'))->value('video_provider_id'),
        );
    }

    #[DataProvider('typedIdsAndTheirStoredForm')]
    public function test_administration_stores_a_changed_lesson_id_in_lower_case(string $typed, string $stored): void
    {
        $lesson = $this->lesson($this->course('etap-1'), 1, self::OWN_ID);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => $typed])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', $stored);

        $this->assertSame($stored, $lesson->fresh()->video_provider_id);
        $this->assertSame($stored, DB::table('lessons')->where('id', $lesson->id)->value('video_provider_id'));
    }

    public function test_the_lessons_own_id_in_another_letter_case_is_not_a_change(): void
    {
        $lesson = $this->lesson($this->course('etap-1'), 1, self::OWN_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Zmieniony tytuł',
            'video_provider_id' => 'MOCK-WLASNE-NAGRANIE',
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Zmieniony tytuł')
            ->assertJsonPath('data.video_provider_id', self::OWN_ID);

        $fresh = $lesson->fresh();
        $this->assertSame('Zmieniony tytuł', $fresh->title);
        $this->assertSame(self::OWN_ID, $fresh->video_provider_id);
    }

    public function test_an_id_stored_with_capital_letters_before_the_change_stays_as_it_was_when_resent(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);
        DB::table('lessons')->where('id', $lesson->id)->update(['video_provider_id' => self::LEGACY_ID]);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        foreach ([self::LEGACY_ID, strtolower(self::LEGACY_ID)] as $index => $resent) {
            $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
                'title' => 'Zmiana '.$index,
                'video_provider_id' => $resent,
            ])
                ->assertOk()
                ->assertJsonPath('data.video_provider_id', self::LEGACY_ID);

            $fresh = $lesson->fresh();
            $this->assertSame('Zmiana '.$index, $fresh->title);
            $this->assertSame(self::LEGACY_ID, $fresh->video_provider_id);
        }

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => 'MOCK-INNE-NAGRANIE'])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', 'mock-inne-nagranie');
        $this->assertSame('mock-inne-nagranie', $lesson->fresh()->video_provider_id);
    }

    public function test_an_id_stored_with_capital_letters_before_the_change_still_holds_the_recording(): void
    {
        $course = $this->course('etap-1');
        $holder = $this->lesson($course, 1, null);
        DB::table('lessons')->where('id', $holder->id)->update(['video_provider_id' => self::LEGACY_ID]);
        $other = $this->lesson($course, 2, self::OWN_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$other->id}", ['video_provider_id' => 'mock-stare-nagranie'])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE);

        $this->assertSame(self::OWN_ID, $other->fresh()->video_provider_id);
        $this->assertSame(self::LEGACY_ID, $holder->fresh()->video_provider_id);
    }

    public function test_an_instructor_resending_an_id_stored_with_capital_letters_leaves_it_as_it_was(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);
        DB::table('lessons')->where('id', $lesson->id)->update(['video_provider_id' => self::LEGACY_ID]);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", [
            'title' => 'Zmiana prowadzącego',
            'video_provider_id' => self::LEGACY_ID,
        ])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', self::LEGACY_ID);

        $fresh = $lesson->fresh();
        $this->assertSame('Zmiana prowadzącego', $fresh->title);
        $this->assertSame(self::LEGACY_ID, $fresh->video_provider_id);
    }

    public function test_an_instructor_still_cannot_assign_the_id_in_another_letter_case(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, 'mock-stare-nagranie');
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => 'MOCK-STARE-NAGRANIE'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame('mock-stare-nagranie', $lesson->fresh()->video_provider_id);
    }

    public function test_a_create_that_loses_the_race_for_the_id_is_refused_and_saves_nothing(): void
    {
        $course = $this->course('etap-1');
        $otherCourse = $this->course('etap-2');
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $this->competitorTakesTheIdOnce('creating', $otherCourse, 'mock-wyscig');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => 'MOCK-WYSCIG',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', 'Popraw zaznaczone pola.')
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
        $this->assertSame(0, DB::table('audit_log')->where('action', 'course.updated')->count());
    }

    public function test_a_save_that_loses_the_race_for_the_id_is_refused_and_saves_nothing(): void
    {
        $course = $this->course('etap-1');
        $otherCourse = $this->course('etap-2');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');
        $this->competitorTakesTheIdOnce('updating', $otherCourse, 'mock-wyscig');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Tytuł, który nie może się zapisać',
            'video_provider_id' => 'mock-wyscig',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $fresh = $lesson->fresh();
        $this->assertSame(self::OWN_ID, $fresh->video_provider_id);
        $this->assertSame('Lekcja z nagraniem', $fresh->title);
        $this->assertSame(0, DB::table('audit_log')->where('action', 'course.updated')->count());
    }

    #[DataProvider('guidsHeldByAnotherLesson')]
    public function test_an_upload_whose_provider_id_is_held_by_another_lesson_is_a_provider_error(string $guid): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => $guid])]);
        $course = $this->course('etap-1');
        $holder = $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $withoutRecording = $this->lesson($course, 2, null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'bunny_error');
        $this->postJson("/api/v1/admin/lessons/{$withoutRecording->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'bunny_error');

        $this->assertSame(self::OWN_ID, $lesson->fresh()->video_provider_id);
        $this->assertNull($withoutRecording->fresh()->video_provider_id);
        $this->assertSame(self::HELD_ID, $holder->fresh()->video_provider_id);
        Http::assertSentCount(2);
    }

    /** @return array<string, array{0: string}> */
    public static function guidsOfTheLessonsOwnRecording(): array
    {
        return [
            'the same letters' => [self::OWN_ID],
            'another letter case' => ['MOCK-WLASNE-NAGRANIE'],
        ];
    }

    #[DataProvider('guidsOfTheLessonsOwnRecording')]
    public function test_an_upload_whose_provider_id_is_the_lessons_own_is_not_an_error(string $guid): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => $guid])]);
        $lesson = $this->lesson($this->course('etap-1'), 1, self::OWN_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', $guid);

        $this->assertSame(self::OWN_ID, $lesson->fresh()->video_provider_id);
    }

    public function test_an_upload_stores_the_provider_id_in_lower_case_and_signs_the_id_as_returned(): void
    {
        $this->configureBunny();
        $guid = '3FA85F64-5717-4562-B3FC-2C963F66AFA6';
        Http::fake(['*' => Http::response(['guid' => $guid])]);
        $lesson = $this->lesson($this->course('etap-1'), 1, null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated();

        // Wgranie zapisuje identyfikator jako nagranie „w drodze”; odtwarzanym
        // staje się dopiero po gotowości — w tej samej postaci, małymi literami.
        $this->assertSame(strtolower($guid), $lesson->fresh()->video_pending_id);
        $this->assertNull($lesson->fresh()->video_provider_id);
        $this->assertSame($guid, $response->json('data.video_id'));
        $this->assertSame(
            hash('sha256', self::LIBRARY.self::API_KEY.$response->json('data.expiration_time').$guid),
            $response->json('data.signature'),
        );
    }

    public function test_the_id_of_a_deleted_lesson_does_not_block_an_upload(): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::HELD_ID])]);
        $course = $this->course('etap-1');
        $this->lesson($course, 1, self::HELD_ID)->delete();
        $lesson = $this->lesson($course, 2, null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated();

        $this->assertSame(self::HELD_ID, $lesson->fresh()->video_pending_id);
    }

    /**
     * Kolejność wdrożenia: kod przed migracją. Bez indeksu nic nie odmawia
     * zapisu po stronie bazy, a zapis małymi literami i reguła „już przypisany"
     * działają tak samo.
     */
    public function test_the_code_works_on_the_schema_without_the_index(): void
    {
        DB::statement('DROP INDEX lessons_video_provider_id_unique');
        $this->configureBunny();
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $holder = $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $created = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => 'MOCK-NOWE-NAGRANIE',
        ])
            ->assertCreated()
            ->assertJsonPath('data.video_provider_id', 'mock-nowe-nagranie');
        $this->assertSame('mock-nowe-nagranie', Lesson::findOrFail($created->json('data.id'))->video_provider_id);

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Zajęte',
            'video_provider_id' => 'MOCK-ZAJETE-NAGRANIE',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE);

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => 'Mock-Inne-Nagranie'])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', 'mock-inne-nagranie');
        $this->assertSame('mock-inne-nagranie', $lesson->fresh()->video_provider_id);

        Http::fake(['*' => Http::response(['guid' => '3FA85F64-5717-4562-B3FC-2C963F66AFA6'])]);
        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])->assertCreated();
        $this->assertSame('3fa85f64-5717-4562-b3fc-2c963f66afa6', $lesson->fresh()->video_pending_id);
        $this->assertSame('mock-inne-nagranie', $lesson->fresh()->video_provider_id);
        $this->assertSame(self::HELD_ID, $holder->fresh()->video_provider_id);
    }

    /**
     * Konkurent zapisuje ten sam identyfikator do innej lekcji dokładnie raz,
     * tuż przed zapisem lekcji z żądania (po przejściu reguły żądania).
     */
    private function competitorTakesTheIdOnce(string $event, Course $course, string $id): void
    {
        $fired = false;

        Lesson::{$event}(function () use (&$fired, $course, $id): void {
            if ($fired) {
                return;
            }

            $fired = true;

            Lesson::withoutEvents(fn () => Lesson::create([
                'course_id' => $course->id,
                'title' => 'Lekcja konkurenta',
                'sequence_order' => 1,
                'duration_seconds' => 600,
                'video_provider_id' => $id,
            ]));
        });
    }

    private function configureBunny(): void
    {
        Config::set('services.bunny.api_key', self::API_KEY);
        Config::set('services.bunny.library_id', self::LIBRARY);
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
    }

    private function course(string $slug): Course
    {
        return Course::create([
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function lesson(Course $course, int $sequenceOrder, ?string $recording): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja z nagraniem',
            'sequence_order' => $sequenceOrder,
            'duration_seconds' => 1800,
            'video_provider_id' => $recording,
        ]);
    }

    private function assignedInstructor(Course $course): User
    {
        $instructor = User::factory()->role('instructor')->create();

        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);

        return $instructor;
    }
}
