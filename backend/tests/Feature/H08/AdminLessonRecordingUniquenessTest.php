<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Identyfikator nagrania (`video_provider_id`) przy zapisie lekcji przez
 * administrację: jedno nagranie należy do jednej żywej lekcji. Serwer podpisuje
 * dostęp do nagrania wpisanego w lekcję, a biblioteka nagrań jest jedna — ten
 * sam identyfikator w dwóch lekcjach dawałby dostęp do cudzego nagrania.
 *
 * Własna lekcja jest pomijana, a wartość niezmieniona wobec zapisanej przechodzi
 * zawsze (zastane powtórzenie nie może zablokować edycji innych pól). Lekcja
 * miękko usunięta nie zajmuje identyfikatora. Każda metoda sprawdza skutek
 * w bazie, nie tylko kod odpowiedzi.
 */
class AdminLessonRecordingUniquenessTest extends TestCase
{
    use RefreshDatabase;

    private const string TAKEN_MESSAGE = 'Ten identyfikator nagrania jest już przypisany do innej lekcji.';

    private const string SHAPE_MESSAGE = 'Identyfikator nagrania może zawierać tylko litery bez polskich znaków, cyfry i myślniki, razem od 1 do 64 znaków.';

    private const string HELD_ID = 'mock-zajete-nagranie';

    private const string OWN_ID = 'mock-wlasne-nagranie';

    /** @return array<string, array{string}> */
    public static function administrationRoles(): array
    {
        return [
            'super admin' => ['super_admin'],
            'project manager' => ['project_manager'],
        ];
    }

    /** @return array<string, array{mixed}> */
    public static function valuesThatAreNotText(): array
    {
        return [
            'integer' => [5],
            'true' => [true],
            'empty list' => [[]],
            'list with the held id' => [[self::HELD_ID]],
            'object' => [['a' => 1]],
        ];
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_cannot_create_a_lesson_with_an_id_held_by_another_lesson(string $role): void
    {
        $course = $this->course('etap-1');
        $holder = $this->lesson($course, 1, self::HELD_ID);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => self::HELD_ID,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertSame(1, Lesson::where('course_id', $course->id)->count());
        $this->assertSame(self::HELD_ID, $holder->fresh()->video_provider_id);
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_cannot_create_a_lesson_with_an_id_held_by_a_lesson_of_another_course(string $role): void
    {
        $course = $this->course('etap-1');
        $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => self::HELD_ID,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE);

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_cannot_change_a_lesson_to_an_id_held_by_another_lesson(string $role): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $holder = $this->lesson($this->course('etap-2'), 1, self::HELD_ID);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Tytuł, który nie może się zapisać',
            'video_provider_id' => self::HELD_ID,
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

    #[DataProvider('administrationRoles')]
    public function test_administration_may_resend_the_lessons_own_unchanged_id(string $role): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $this->lesson($course, 2, self::HELD_ID);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Zmieniony tytuł',
            'video_provider_id' => self::OWN_ID,
        ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Zmieniony tytuł')
            ->assertJsonPath('data.video_provider_id', self::OWN_ID);

        $fresh = $lesson->fresh();
        $this->assertSame('Zmieniony tytuł', $fresh->title);
        $this->assertSame(self::OWN_ID, $fresh->video_provider_id);
    }

    public function test_an_unchanged_id_passes_even_when_another_lesson_already_holds_it(): void
    {
        $course = $this->course('etap-1');
        $first = $this->lesson($course, 1, self::HELD_ID);
        $second = $this->lesson($course, 2, self::HELD_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$first->id}", [
            'title' => 'Edycja przy zastanym powtórzeniu',
            'video_provider_id' => self::HELD_ID,
        ])->assertOk();

        $this->assertSame('Edycja przy zastanym powtórzeniu', $first->fresh()->title);
        $this->assertSame(self::HELD_ID, $first->fresh()->video_provider_id);
        $this->assertSame(self::HELD_ID, $second->fresh()->video_provider_id);

        $this->patchJson("/api/v1/admin/lessons/{$first->id}", ['video_provider_id' => self::OWN_ID])->assertOk();
        $this->assertSame(self::OWN_ID, $first->fresh()->video_provider_id);

        $this->patchJson("/api/v1/admin/lessons/{$first->id}", ['video_provider_id' => self::HELD_ID])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::TAKEN_MESSAGE);
        $this->assertSame(self::OWN_ID, $first->fresh()->video_provider_id);
    }

    public function test_the_id_of_a_deleted_lesson_is_free_on_create(): void
    {
        $course = $this->course('etap-1');
        $deleted = $this->lesson($course, 1, self::HELD_ID);
        $deleted->delete();
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $created = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => self::HELD_ID,
        ])
            ->assertCreated()
            ->assertJsonPath('data.video_provider_id', self::HELD_ID);

        $this->assertSame(self::HELD_ID, Lesson::findOrFail($created->json('data.id'))->video_provider_id);
    }

    public function test_the_id_of_a_deleted_lesson_is_free_on_save(): void
    {
        $course = $this->course('etap-1');
        $deleted = $this->lesson($course, 1, self::HELD_ID);
        $lesson = $this->lesson($course, 2, self::OWN_ID);
        $deleted->delete();
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => self::HELD_ID])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', self::HELD_ID);

        $this->assertSame(self::HELD_ID, $lesson->fresh()->video_provider_id);
    }

    public function test_many_lessons_may_have_no_recording(): void
    {
        $course = $this->course('etap-1');
        $first = $this->lesson($course, 1, null);
        $second = $this->lesson($course, 2, self::OWN_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        foreach ([null, '', '   '] as $empty) {
            $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
                'title' => 'Bez nagrania',
                'video_provider_id' => $empty,
            ])->assertCreated()->assertJsonPath('data.video_provider_id', null);
        }

        $this->patchJson("/api/v1/admin/lessons/{$first->id}", ['video_provider_id' => null])->assertOk();
        $this->patchJson("/api/v1/admin/lessons/{$second->id}", ['video_provider_id' => null])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', null);

        $this->assertSame(0, Lesson::where('course_id', $course->id)->whereNotNull('video_provider_id')->count());
    }

    public function test_a_value_outside_the_pattern_is_reported_by_the_shape_rule_only(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, null);
        $other = $this->lesson($course, 2, null);
        DB::table('lessons')->where('id', $other->id)->update(['video_provider_id' => 'a b']);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => 'a b'])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', self::SHAPE_MESSAGE)
            ->assertJsonCount(1, 'error.errors.video_provider_id');

        $this->assertNull($lesson->fresh()->video_provider_id);
    }

    #[DataProvider('valuesThatAreNotText')]
    public function test_a_value_that_is_not_text_is_refused_not_a_server_error(mixed $value): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $this->lesson($course, 2, self::HELD_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => $value])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['video_provider_id']]]);

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $value,
        ])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['video_provider_id']]]);

        $this->assertSame(self::OWN_ID, $lesson->fresh()->video_provider_id);
        $this->assertSame(2, Lesson::where('course_id', $course->id)->count());
    }

    public function test_other_lesson_fields_are_saved_as_before_when_the_id_is_free(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Zmieniony tytuł',
            'description' => 'Zmieniony opis',
            'duration_seconds' => 900,
            'video_provider_id' => 'mock-wolne-nagranie',
        ])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', 'mock-wolne-nagranie');

        $fresh = $lesson->fresh();
        $this->assertSame('Zmieniony tytuł', $fresh->title);
        $this->assertSame('Zmieniony opis', $fresh->description);
        $this->assertSame(900, $fresh->duration_seconds);
        $this->assertSame('mock-wolne-nagranie', $fresh->video_provider_id);
    }

    public function test_the_audit_of_a_lesson_save_carries_no_recording_id(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 1, self::OWN_ID);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Zapis z audytem',
            'video_provider_id' => 'mock-wolne-nagranie',
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
        $this->assertStringNotContainsString('mock-wolne-nagranie', (string) $rows[0]->details);
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
}
