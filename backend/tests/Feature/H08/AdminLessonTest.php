<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H08 · CRUD lekcji w panelu administracji i miękkie usuwanie.
 *
 * Oczekiwane wartości pochodzą z planu fazy 3, z karty pakietu (kryterium ★2)
 * i z kontraktu API (§1.1 tabela kodów, §3.2 rejestr audytu) — nigdy z tego,
 * co akurat zwraca kod.
 */
class AdminLessonTest extends TestCase
{
    use RefreshDatabase;

    /** Kształt zasobu lekcji wg planu fazy 3, pkt 5. */
    private const array RESOURCE_FIELDS = [
        'id',
        'course_id',
        'title',
        'description',
        'sequence_order',
        'video_provider_id',
        'duration_seconds',
        'materials_count',
        'created_at',
        'updated_at',
    ];

    public function test_volunteer_is_forbidden_on_the_lesson_list(): void
    {
        $course = $this->course('etap-1');

        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->getJson("/api/v1/admin/courses/{$course->id}/lessons")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $course = $this->course('etap-1');

        $this->getJson("/api/v1/admin/courses/{$course->id}/lessons")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_list_is_scoped_to_the_course_and_ordered_by_sequence(): void
    {
        $course = $this->course('etap-1');
        $second = $this->lesson($course, 'Druga', 2);
        $first = $this->lesson($course, 'Pierwsza', 1);

        $other = $this->course('etap-2');
        $foreign = $this->lesson($other, 'Cudza lekcja', 1);

        $this->actingAsAdmin();

        $response = $this->getJson("/api/v1/admin/courses/{$course->id}/lessons")->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertSame([$first->id, $second->id], $ids);
        $this->assertNotContains($foreign->id, $ids, 'Lista lekcji nie może przeciekać między kursami.');

        // Plan fazy 3: lista lekcji jednego kursu idzie bez paginacji.
        $this->assertNull($response->json('meta'));
    }

    public function test_list_item_carries_exactly_the_planned_fields(): void
    {
        $course = $this->course('etap-1');
        $this->lesson($course, 'Pierwsza', 1);

        $this->actingAsAdmin();

        $item = $this->getJson("/api/v1/admin/courses/{$course->id}/lessons")->assertOk()->json('data.0');

        $this->assertSame(self::RESOURCE_FIELDS, array_keys($item));
        $this->assertSame($course->id, $item['course_id']);
        $this->assertSame(0, $item['materials_count']);
    }

    public function test_unknown_course_returns_not_found_on_the_lesson_list(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/v1/admin/courses/999999/lessons')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_new_lesson_takes_the_next_free_number_and_is_audited(): void
    {
        $course = $this->course('etap-1');
        $this->lesson($course, 'Pierwsza', 1);
        $this->lesson($course, 'Druga', 2);

        $admin = $this->actingAsAdmin();

        $response = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Trzecia',
            'description' => 'Opis lekcji',
            'video_provider_id' => 'mock-etap-1-3',
            'duration_seconds' => 1800,
        ])->assertCreated();

        $this->assertSame(self::RESOURCE_FIELDS, array_keys($response->json('data')));
        $this->assertSame(3, $response->json('data.sequence_order'));
        $this->assertSame($course->id, $response->json('data.course_id'));
        $this->assertSame('mock-etap-1-3', $response->json('data.video_provider_id'));
        $this->assertSame(1800, $response->json('data.duration_seconds'));

        $lesson = Lesson::where('title', 'Trzecia')->firstOrFail();
        $this->assertSame($course->id, $lesson->course_id);
        $this->assertSame(3, $lesson->sequence_order);

        // Rejestr audytu §3.2 nie ma slugów dla lekcji: operacja zapisuje się
        // jako `course.updated` na kursie, z rodzajem w `details.op`.
        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('lesson.created', $entry->details['op']);
        $this->assertSame($lesson->id, $entry->details['lesson_id']);
    }

    public function test_first_lesson_of_an_empty_course_gets_number_one(): void
    {
        $course = $this->course('etap-1');

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['title' => 'Pierwsza'])
            ->assertCreated()
            ->assertJsonPath('data.sequence_order', 1)
            ->assertJsonPath('data.description', null)
            ->assertJsonPath('data.video_provider_id', null)
            ->assertJsonPath('data.duration_seconds', 0);
    }

    public function test_explicit_sequence_order_is_honoured(): void
    {
        $course = $this->course('etap-1');
        $this->lesson($course, 'Pierwsza', 1);

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Wstawiona',
            'sequence_order' => 7,
        ])->assertCreated()->assertJsonPath('data.sequence_order', 7);
    }

    public function test_lesson_without_a_title_is_rejected_as_a_field_error(): void
    {
        $course = $this->course('etap-1');

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['duration_seconds' => 60])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['title']]]);

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
        $this->assertSame(0, AuditLogEntry::where('action', 'course.updated')->count());
    }

    public function test_negative_duration_is_rejected(): void
    {
        $course = $this->course('etap-1');

        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Zła lekcja',
            'duration_seconds' => -1,
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['duration_seconds']]]);
    }

    public function test_updating_a_lesson_changes_fields_and_audits_the_course(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 'Stary tytuł', 1);

        $admin = $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", [
            'title' => 'Nowy tytuł',
            'video_provider_id' => 'mock-etap-1-1',
        ])->assertOk()
            ->assertJsonPath('data.title', 'Nowy tytuł')
            ->assertJsonPath('data.video_provider_id', 'mock-etap-1-1')
            ->assertJsonPath('data.sequence_order', 1);

        $lesson->refresh();
        $this->assertSame('Nowy tytuł', $lesson->title);
        $this->assertSame('mock-etap-1-1', $lesson->video_provider_id);

        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('lesson.updated', $entry->details['op']);
        $this->assertSame($lesson->id, $entry->details['lesson_id']);
    }

    public function test_unknown_lesson_returns_not_found(): void
    {
        $this->actingAsAdmin();

        $this->patchJson('/api/v1/admin/lessons/999999', ['title' => 'Nieistniejąca'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->deleteJson('/api/v1/admin/lessons/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_already_deleted_lesson_returns_not_found(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course, 'Pierwsza', 1);

        $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/lessons/{$lesson->id}")->assertOk();

        // Miękko usunięta lekcja jest poza wiązaniem modelu — dla panelu
        // przestała istnieć (kontrakt §1.1: nie ujawniamy istnienia).
        $this->deleteJson("/api/v1/admin/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['title' => 'Wskrzeszona'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * Kryterium ★2 karty pakietu: „usunięcie lekcji z postępami = soft delete;
     * postęp historyczny zostaje". FK `lesson_progress.lesson_id` ma
     * `cascadeOnDelete`, ale to kaskada twardego usunięcia — miękkie tylko
     * stempluje `deleted_at`, więc wiersz postępu musi przeżyć.
     */
    public function test_deleting_a_lesson_is_soft_and_keeps_historical_progress(): void
    {
        $course = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $kept = $this->lesson($course, 'Pierwsza', 1);
        $removed = $this->lesson($course, 'Druga', 2);

        $volunteer = User::factory()->role('volunteer')->create();
        $progress = LessonProgress::create([
            'user_id' => $volunteer->id,
            'lesson_id' => $removed->id,
            'watched_seconds' => 1800,
            'active_seconds' => 1500,
            'open_count' => 3,
            'is_completed' => true,
            'completed_at' => now(),
        ]);

        $admin = $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/lessons/{$removed->id}")
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $removed->id, 'deleted' => true]]);

        $this->assertNull(Lesson::find($removed->id), 'Lekcja ma zniknąć ze zwykłych zapytań.');
        $this->assertNotNull(Lesson::withTrashed()->findOrFail($removed->id)->deleted_at);

        $this->assertDatabaseHas('lesson_progress', [
            'id' => $progress->id,
            'user_id' => $volunteer->id,
            'lesson_id' => $removed->id,
        ]);
        $this->assertTrue($progress->fresh()->is_completed);
        $this->assertSame(1500, $progress->fresh()->active_seconds);

        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('lesson.deleted', $entry->details['op']);
        $this->assertSame($removed->id, $entry->details['lesson_id']);

        // Uczestnik nie widzi już usuniętej lekcji na stronie kursu.
        Sanctum::actingAs($volunteer);

        $lessons = $this->getJson('/api/v1/courses/etap-1')->assertOk()->json('data.lessons');

        $this->assertSame([$kept->id], collect($lessons)->pluck('id')->all());
    }

    /**
     * Świadomy, udokumentowany skutek uboczny — NIE regresja. `Course::lessons()`
     * nie ma `withTrashed()`, więc usunięta lekcja znika także z mianownika
     * `CourseAccess::allLessonsCompleted()`. Usunięcie ostatniej nieukończonej
     * lekcji natychmiast przestawia kurs na `completed` i odblokowuje następny
     * etap. Panel musi o tym ostrzegać, ale reguły nie blokujemy.
     */
    public function test_deleting_the_last_incomplete_lesson_completes_the_course_and_unlocks_the_next_stage(): void
    {
        $first = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $done = $this->lesson($first, 'Pierwsza', 1);
        $pending = $this->lesson($first, 'Druga', 2);

        $second = $this->course('etap-2', ['sequence_order' => 2, 'is_published' => true]);
        $this->lesson($second, 'Pierwsza', 1);

        $volunteer = User::factory()->role('volunteer')->create();
        LessonProgress::create([
            'user_id' => $volunteer->id,
            'lesson_id' => $done->id,
            'watched_seconds' => 1800,
            'active_seconds' => 1800,
            'open_count' => 1,
            'is_completed' => true,
            'completed_at' => now(),
        ]);

        Sanctum::actingAs($volunteer);

        $before = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))->keyBy('slug');
        $this->assertSame('in_progress', $before['etap-1']['status']);
        $this->assertSame(50, $before['etap-1']['progress_percent']);
        $this->assertSame('locked', $before['etap-2']['status']);

        $this->actingAsAdmin();
        $this->deleteJson("/api/v1/admin/lessons/{$pending->id}")->assertOk();

        Sanctum::actingAs($volunteer);

        $after = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))->keyBy('slug');
        $this->assertSame('completed', $after['etap-1']['status']);
        $this->assertSame(100, $after['etap-1']['progress_percent']);
        $this->assertSame('in_progress', $after['etap-2']['status']);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function course(string $slug, array $attributes = []): Course
    {
        return Course::create($attributes + [
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function lesson(Course $course, string $title, int $sequenceOrder): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => $title,
            'sequence_order' => $sequenceOrder,
            'duration_seconds' => 1800,
        ]);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        return $admin;
    }
}
