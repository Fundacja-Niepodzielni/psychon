<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H08 · CRUD kursów w panelu administracji.
 *
 * Oczekiwane wartości pochodzą z planu fazy 2 i z kontraktu API (§1.1 tabela
 * kodów, §3.2 rejestr audytu) — nigdy z tego, co akurat zwraca kod.
 */
class AdminCourseTest extends TestCase
{
    use RefreshDatabase;

    /** Kształt zasobu administracyjnego wg planu fazy 2, pkt 5. */
    private const array RESOURCE_FIELDS = [
        'id',
        'title',
        'slug',
        'description',
        'type',
        'product_group',
        'sequence_order',
        'edition_id',
        'is_published',
        'lessons_count',
        'materials_count',
        'created_at',
        'updated_at',
    ];

    public function test_volunteer_is_forbidden_on_the_admin_course_list(): void
    {
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->getJson('/api/v1/admin/courses')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $this->getJson('/api/v1/admin/courses')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_admin_list_shows_drafts_alongside_published_courses(): void
    {
        $published = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $draft = $this->course('szkic', ['sequence_order' => null, 'is_published' => false]);

        $this->actingAsAdmin();

        $response = $this->getJson('/api/v1/admin/courses')->assertOk();

        $items = collect($response->json('data'))->keyBy('slug');

        $this->assertTrue($items->has('szkic'), 'Panel musi widzieć szkice — inaczej nie da się dokończyć kursu.');
        $this->assertFalse($items['szkic']['is_published']);
        $this->assertTrue($items['etap-1']['is_published']);
        $this->assertSame([$published->id, $draft->id], $items->pluck('id')->sort()->values()->all());

        $this->assertSame(1, $response->json('meta.current_page'));
        $this->assertSame(25, $response->json('meta.per_page'));
        $this->assertSame(2, $response->json('meta.total'));
        $this->assertSame(1, $response->json('meta.last_page'));
    }

    public function test_list_item_carries_exactly_the_planned_fields(): void
    {
        $course = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        Lesson::create(['course_id' => $course->id, 'title' => 'Lekcja 1', 'sequence_order' => 1]);

        $this->actingAsAdmin();

        $item = $this->getJson('/api/v1/admin/courses')->assertOk()->json('data.0');

        $this->assertSame(self::RESOURCE_FIELDS, array_keys($item));
        $this->assertSame(1, $item['lessons_count']);
        $this->assertSame(0, $item['materials_count']);
    }

    public function test_search_and_type_filters_narrow_the_list(): void
    {
        $this->course('etap-1', ['title' => 'Podstawy pomocy', 'sequence_order' => 1]);
        $this->course('webinar-wrzesien', ['title' => 'Webinar wrześniowy', 'type' => 'webinar']);

        $this->actingAsAdmin();

        $this->assertSame(
            ['webinar-wrzesien'],
            collect($this->getJson('/api/v1/admin/courses?type=webinar')->assertOk()->json('data'))
                ->pluck('slug')->all(),
        );

        $this->assertSame(
            ['etap-1'],
            collect($this->getJson('/api/v1/admin/courses?search=podstawy')->assertOk()->json('data'))
                ->pluck('slug')->all(),
        );
    }

    public function test_unknown_course_returns_not_found(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/v1/admin/courses/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_new_course_is_created_as_a_draft_and_is_audited(): void
    {
        $admin = $this->actingAsAdmin();

        $response = $this->postJson('/api/v1/admin/courses', [
            'title' => 'Nowy etap',
            'slug' => 'nowy-etap',
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 4,
        ])->assertCreated();

        $this->assertFalse($response->json('data.is_published'));
        $this->assertSame(self::RESOURCE_FIELDS, array_keys($response->json('data')));

        $course = Course::where('slug', 'nowy-etap')->firstOrFail();
        $this->assertFalse($course->is_published);
        $this->assertSame(4, $course->sequence_order);

        $entry = AuditLogEntry::where('action', 'course.created')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
    }

    public function test_duplicate_slug_is_rejected_as_a_field_error(): void
    {
        $this->course('etap-1');
        $this->actingAsAdmin();

        $this->postJson('/api/v1/admin/courses', ['title' => 'Kopia', 'slug' => 'etap-1'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['slug']]]);

        $this->assertSame(1, Course::where('slug', 'etap-1')->count());
    }

    public function test_course_may_keep_its_own_slug_on_update(): void
    {
        $course = $this->course('etap-1', ['title' => 'Stary tytuł']);
        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/courses/{$course->id}", [
            'title' => 'Nowy tytuł',
            'slug' => 'etap-1',
        ])->assertOk()->assertJsonPath('data.title', 'Nowy tytuł');
    }

    public function test_publishing_a_course_without_lessons_is_rejected(): void
    {
        $course = $this->course('pusty', ['sequence_order' => 2, 'is_published' => false]);
        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.missing', ['lessons']);

        $this->assertFalse($course->fresh()->is_published);
        $this->assertSame(0, AuditLogEntry::where('action', 'course.updated')->count());
    }

    public function test_publishing_together_with_other_fields_is_still_rejected(): void
    {
        $course = $this->course('pusty', ['title' => 'Pusty', 'is_published' => false]);
        $this->actingAsAdmin();

        // Reguła musi liczyć stan PO złożeniu żądania: sprawdzona na stanie
        // sprzed edycji przepuściłaby ten PATCH.
        $this->patchJson("/api/v1/admin/courses/{$course->id}", [
            'title' => 'Pusty — poprawiony',
            'is_published' => true,
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met');

        $course->refresh();
        $this->assertFalse($course->is_published);
        $this->assertSame('Pusty', $course->title);
    }

    public function test_creating_a_published_course_is_rejected_and_writes_nothing(): void
    {
        $this->actingAsAdmin();

        $this->postJson('/api/v1/admin/courses', [
            'title' => 'Od razu opublikowany',
            'slug' => 'od-razu',
            'is_published' => true,
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.missing', ['lessons']);

        $this->assertFalse(Course::where('slug', 'od-razu')->exists());
        $this->assertSame(0, AuditLogEntry::where('action', 'course.created')->count());
    }

    public function test_publishing_a_course_with_a_lesson_succeeds_and_is_audited(): void
    {
        $course = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => false]);
        Lesson::create(['course_id' => $course->id, 'title' => 'Lekcja 1', 'sequence_order' => 1]);

        $admin = $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.is_published', true)
            ->assertJsonPath('data.lessons_count', 1);

        $this->assertTrue($course->fresh()->is_published);

        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertContains('is_published', $entry->details['changed']);
    }

    public function test_deleting_a_prerequisite_of_a_published_stage_is_rejected(): void
    {
        $first = $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $second = $this->course('etap-2', ['sequence_order' => 2, 'is_published' => true]);

        $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/courses/{$first->id}")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.blocking_course_ids', [$second->id]);

        $this->assertNotNull(Course::find($first->id), 'Odrzucone usunięcie nie może ruszyć rekordu.');
        $this->assertNull($first->fresh()->deleted_at);
        $this->assertSame(0, AuditLogEntry::where('action', 'course.deleted')->count());
    }

    public function test_draft_course_may_be_deleted_even_in_the_middle_of_the_path(): void
    {
        $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $draft = $this->course('szkic', ['sequence_order' => 2, 'is_published' => false]);
        $this->course('etap-3', ['sequence_order' => 3, 'is_published' => true]);

        $this->actingAsAdmin();

        // Szkic jest przezroczysty dla reguły odblokowań (CourseAccess filtruje
        // poprzednika po `is_published`), więc jego usunięcie nikogo nie skraca.
        $this->deleteJson("/api/v1/admin/courses/{$draft->id}")->assertOk();

        $this->assertNull(Course::find($draft->id));
    }

    public function test_deleting_the_last_stage_succeeds_and_is_audited(): void
    {
        $this->course('etap-1', ['sequence_order' => 1, 'is_published' => true]);
        $last = $this->course('etap-2', ['sequence_order' => 2, 'is_published' => true]);

        $admin = $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/courses/{$last->id}")
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $last->id, 'deleted' => true]]);

        $this->assertNull(Course::find($last->id));
        $this->assertNotNull(Course::withTrashed()->find($last->id)->deleted_at);

        $entry = AuditLogEntry::where('action', 'course.deleted')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($last->id, $entry->subject_id);

        $this->getJson("/api/v1/admin/courses/{$last->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
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

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        return $admin;
    }
}
