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
 * Nagranie do lekcji (`video_provider_id`) przypisuje administracja, nie
 * prowadzący. Serwer podpisuje dostęp do nagrania wpisanego w lekcję, a
 * biblioteka nagrań jest jedna — prowadzący, który wpisałby do swojej lekcji
 * cudzy identyfikator, dostałby dostęp do cudzego nagrania.
 *
 * Zakaz nie może być zwykłym „pole zabronione": stary edytor prowadzącego
 * odsyła przy KAŻDYM zapisie lekcji wartość wczytaną z lekcji (albo `null`),
 * więc prowadzący może odesłać to, co jest zapisane, i nic innego. Nowa lekcja
 * prowadzącego nie ma nagrania. Każdy inny przypadek kończy się jednym
 * zdaniem odmowy, które nie mówi, czy identyfikator istnieje w innej lekcji.
 * Każda metoda sprawdza skutek w bazie, nie tylko kod odpowiedzi.
 */
class InstructorLessonRecordingTest extends TestCase
{
    use RefreshDatabase;

    private const string MESSAGE = 'Nagranie do lekcji przypisuje administracja. Tego pola nie można tutaj zmienić.';

    private const string STORED_ID = 'mock-stare-nagranie';

    private const string FOREIGN_ID = 'mock-cudze-nagranie';

    /** @return array<string, array{string}> */
    public static function idsAnInstructorMayNotSet(): array
    {
        return [
            'id held by another lesson' => [self::FOREIGN_ID],
            'id that exists nowhere' => ['mock-nigdzie'],
            'guid' => ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
            'one character' => ['a'],
            'sixty four characters' => [str_repeat('a', 64)],
            'same id in another letter case' => ['MOCK-STARE-NAGRANIE'],
            'parent directory' => ['../x'],
            'slash' => ['a/b'],
            'space inside' => ['a b'],
            'polish letters' => ['żółw'],
            'sixty five characters' => [str_repeat('a', 65)],
        ];
    }

    /** @return array<string, array{string|null}> */
    public static function emptyValues(): array
    {
        return [
            'null' => [null],
            'empty string' => [''],
            'spaces only' => ['   '],
        ];
    }

    /** @return array<string, array{mixed}> */
    public static function valuesThatAreNotText(): array
    {
        return [
            'integer' => [5],
            'zero' => [0],
            'float' => [1.5],
            'true' => [true],
            'false' => [false],
            'empty list' => [[]],
            'list with the stored id' => [[self::STORED_ID]],
            'object' => [['a' => 1]],
        ];
    }

    #[DataProvider('idsAnInstructorMayNotSet')]
    public function test_instructor_cannot_change_the_recording_to_another_id(string $id): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->lesson($this->course('etap-2'), 1, self::FOREIGN_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => $id])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    #[DataProvider('idsAnInstructorMayNotSet')]
    public function test_instructor_cannot_set_a_recording_on_a_lesson_without_one(string $id): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);
        $this->lesson($this->course('etap-2'), 1, self::FOREIGN_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => $id])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE);

        $this->assertNull($lesson->fresh()->video_provider_id);
    }

    public function test_the_refusal_is_the_same_whether_or_not_the_id_exists_elsewhere(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->lesson($this->course('etap-2'), 1, self::FOREIGN_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $existing = $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => self::FOREIGN_ID])
            ->assertStatus(422);
        $missing = $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => 'mock-nigdzie'])
            ->assertStatus(422);

        $this->assertSame($existing->json(), $missing->json());
    }

    public function test_instructor_save_with_the_stored_recording_id_is_accepted(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => self::STORED_ID])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', self::STORED_ID);

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    public function test_instructor_save_in_the_shape_the_old_editor_sends_is_accepted(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", [
            'title' => 'Zmieniony tytuł',
            'description' => 'Zmieniony opis',
            'sequence_order' => 1,
            'video_provider_id' => self::STORED_ID,
            'duration_seconds' => 900,
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Zmieniony tytuł')
            ->assertJsonPath('data.description', 'Zmieniony opis')
            ->assertJsonPath('data.duration_seconds', 900)
            ->assertJsonPath('data.video_provider_id', self::STORED_ID);

        $fresh = $lesson->fresh();
        $this->assertSame('Zmieniony tytuł', $fresh->title);
        $this->assertSame('Zmieniony opis', $fresh->description);
        $this->assertSame(900, $fresh->duration_seconds);
        $this->assertSame(self::STORED_ID, $fresh->video_provider_id);
    }

    public function test_instructor_save_without_the_field_leaves_the_recording_alone(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['title' => 'Sam tytuł'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Sam tytuł');

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    public function test_the_incoming_value_is_trimmed_before_it_is_compared(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => '  '.self::STORED_ID."  \n"])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', self::STORED_ID);

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    #[DataProvider('emptyValues')]
    public function test_instructor_save_with_an_empty_value_on_a_lesson_without_a_recording_is_accepted(?string $empty): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['title' => 'Bez nagrania', 'video_provider_id' => $empty])
            ->assertOk()
            ->assertJsonPath('data.title', 'Bez nagrania')
            ->assertJsonPath('data.video_provider_id', null);

        $this->assertNull($lesson->fresh()->video_provider_id);
    }

    #[DataProvider('emptyValues')]
    public function test_instructor_cannot_detach_the_recording(?string $empty): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['title' => 'Bez odpinania', 'video_provider_id' => $empty])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE);

        $fresh = $lesson->fresh();
        $this->assertSame(self::STORED_ID, $fresh->video_provider_id);
        $this->assertSame('Lekcja z nagraniem', $fresh->title);
    }

    public function test_an_empty_string_stored_in_the_lesson_counts_as_no_recording(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);
        DB::table('lessons')->where('id', $lesson->id)->update(['video_provider_id' => '']);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => null])->assertOk();
        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => 'mock-nigdzie'])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE);
    }

    #[DataProvider('valuesThatAreNotText')]
    public function test_a_value_that_is_not_text_is_refused_on_save_not_a_server_error(mixed $value): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $withoutRecording = $this->lesson($course, 2, null);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => $value])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE);

        $this->patchJson("/api/v1/instructor/lessons/{$withoutRecording->id}", ['video_provider_id' => $value])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE);

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
        $this->assertNull($withoutRecording->fresh()->video_provider_id);
    }

    #[DataProvider('idsAnInstructorMayNotSet')]
    public function test_instructor_cannot_create_a_lesson_with_a_recording_id(string $id): void
    {
        $course = $this->course('etap-1');
        $this->lesson($this->course('etap-2'), 1, self::FOREIGN_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
    }

    public function test_instructor_creates_a_lesson_without_the_recording_field(): void
    {
        $course = $this->course('etap-1');
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $created = $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", ['title' => 'Bez nagrania'])
            ->assertCreated()
            ->assertJsonPath('data.video_provider_id', null);

        $this->assertNull(Lesson::findOrFail($created->json('data.id'))->video_provider_id);
    }

    #[DataProvider('emptyValues')]
    public function test_instructor_creates_a_lesson_with_an_empty_recording_field(?string $empty): void
    {
        $course = $this->course('etap-1');
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $created = $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Z pustym polem',
            'video_provider_id' => $empty,
        ])
            ->assertCreated()
            ->assertJsonPath('data.video_provider_id', null);

        $this->assertNull(Lesson::findOrFail($created->json('data.id'))->video_provider_id);
        $this->assertSame(1, Lesson::where('course_id', $course->id)->count());
    }

    #[DataProvider('valuesThatAreNotText')]
    public function test_a_value_that_is_not_text_is_refused_on_create_not_a_server_error(mixed $value): void
    {
        $course = $this->course('etap-1');
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $value,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::MESSAGE);

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
    }

    public function test_an_unassigned_instructor_is_refused_before_the_recording_field_is_judged(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->lesson($this->course('etap-2'), 1, self::FOREIGN_ID);
        $stranger = User::factory()->role('instructor')->create();
        $this->actingAs($stranger, 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['video_provider_id' => self::FOREIGN_ID])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => self::FOREIGN_ID,
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
        $this->assertSame(1, Lesson::where('course_id', $course->id)->count());
    }

    public function test_the_audit_of_an_instructor_save_carries_no_recording_id(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::STORED_ID);
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", [
            'title' => 'Zapis z audytem',
            'video_provider_id' => self::STORED_ID,
        ])->assertOk();

        $rows = DB::table('audit_log')
            ->where('action', 'course.updated')
            ->where('subject_id', $course->id)
            ->get();

        $this->assertCount(1, $rows);
        $this->assertEquals(
            ['op' => 'lesson.updated', 'lesson_id' => $lesson->id],
            json_decode((string) $rows[0]->details, true),
        );
        $this->assertStringNotContainsString(self::STORED_ID, (string) $rows[0]->details);
    }

    public function test_an_upload_still_sets_the_recording_and_the_instructor_can_keep_saving_other_fields(): void
    {
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
        $guid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
        Http::fake(['*' => Http::response(['guid' => $guid])]);
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);

        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', $guid);
        $this->assertSame($guid, $lesson->fresh()->video_provider_id);

        $this->actingAs($this->assignedInstructor($course), 'keycloak');
        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", [
            'title' => 'Po wgraniu nagrania',
            'video_provider_id' => $guid,
        ])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', $guid);

        $fresh = $lesson->fresh();
        $this->assertSame($guid, $fresh->video_provider_id);
        $this->assertSame('Po wgraniu nagrania', $fresh->title);
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
