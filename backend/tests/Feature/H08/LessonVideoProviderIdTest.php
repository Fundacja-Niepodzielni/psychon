<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Identyfikator nagrania lekcji (`video_provider_id`) przy zapisie przez
 * administrację: od 1 do 64 znaków z klasy `A-Z a-z 0-9 -`. Wartość trafia
 * potem do adresu zadania wychodzącego z kluczem usługi wideo, więc to, co nie
 * jest identyfikatorem, nie może zostać zapisane. Prowadzący własnego kursu
 * nie przypisuje nagrania wcale — patrz `InstructorLessonRecordingTest`. Każdy
 * przypadek sprawdza skutek w bazie, nie tylko kod odpowiedzi.
 */
class LessonVideoProviderIdTest extends TestCase
{
    use RefreshDatabase;

    private const string REJECTION_MESSAGE = 'Identyfikator nagrania może zawierać tylko litery bez polskich znaków, cyfry i myślniki, razem od 1 do 64 znaków.';

    private const string STORED_ID = 'mock-stare-nagranie';

    /** @return array<string, array{string}> */
    public static function rejectedIds(): array
    {
        return [
            'parent directory' => ['../x'],
            'path into another library' => ['../../library/0/videos/x'],
            'slash' => ['a/b'],
            'backslash' => ['a\\b'],
            'question mark' => ['a?x=1'],
            'percent-encoded dots' => ['%2e%2e'],
            'space inside' => ['a b'],
            'polish letters' => ['żółw'],
            'underscore' => ['a_b'],
            'dot' => ['a.b'],
            'sixty five characters' => [str_repeat('a', 65)],
        ];
    }

    /** @return array<string, array{string}> */
    public static function acceptedIds(): array
    {
        return [
            'one character' => ['a'],
            'seed style' => ['mock-etap-1-3'],
            'provider guid' => ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
            'mixed case' => ['AbC-xyz-09'],
            'sixty four characters' => [str_repeat('a', 64)],
        ];
    }

    #[DataProvider('rejectedIds')]
    public function test_administration_cannot_create_a_lesson_with_a_rejected_id(string $id): void
    {
        $course = $this->course('etap-1');
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $id,
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::REJECTION_MESSAGE);

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
    }

    #[DataProvider('rejectedIds')]
    public function test_administration_cannot_change_a_lesson_to_a_rejected_id(string $id): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => $id])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', self::REJECTION_MESSAGE);

        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    #[DataProvider('acceptedIds')]
    public function test_administration_stores_a_conforming_id_unchanged(string $id): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $created = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa lekcja',
            'video_provider_id' => $id,
        ])->assertCreated();

        $this->assertSame($id, $created->json('data.video_provider_id'));
        $this->assertSame($id, Lesson::findOrFail($created->json('data.id'))->video_provider_id);

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => $id])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', $id);

        $this->assertSame($id, $lesson->fresh()->video_provider_id);
    }

    public function test_null_is_still_allowed_and_clears_the_id(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => null])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', null);

        $this->assertNull($lesson->fresh()->video_provider_id);
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

    private function lesson(Course $course): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja z nagraniem',
            'sequence_order' => 1,
            'duration_seconds' => 1800,
            'video_provider_id' => self::STORED_ID,
        ]);
    }
}
