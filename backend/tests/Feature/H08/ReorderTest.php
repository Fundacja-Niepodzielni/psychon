<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\TestAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H08 · kolejność lekcji i kursów oraz podgląd wpływu.
 *
 * Oczekiwane wartości pochodzą z planu fazy 4, z karty pakietu (kryterium 3:
 * „reorder nie kasuje danych") i z kanonicznego seeda demo
 * (`docs/hackathon/04-seed-demo.md` §3) — nigdy z tego, co akurat zwraca kod.
 */
class ReorderTest extends TestCase
{
    use RefreshDatabase;

    public function test_volunteer_is_forbidden_on_the_course_reorder(): void
    {
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

        $this->patchJson('/api/v1/admin/courses/reorder', ['course_ids' => [1]])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated_on_the_impact_preview(): void
    {
        $this->postJson('/api/v1/admin/courses/reorder/preview', ['course_ids' => [1]])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_lesson_reorder_renumbers_the_whole_course_and_is_audited(): void
    {
        $course = $this->course('etap-1', 1);
        $first = $this->lesson($course, 'Lekcja A', 1);
        $second = $this->lesson($course, 'Lekcja B', 2);
        $third = $this->lesson($course, 'Lekcja C', 3);

        $admin = $this->actingAsAdmin();

        $response = $this->patchJson("/api/v1/admin/courses/{$course->id}/lessons/reorder", [
            'lesson_ids' => [$third->id, $first->id, $second->id],
        ])->assertOk();

        $this->assertSame(
            [$third->id, $first->id, $second->id],
            collect($response->json('data'))->pluck('id')->all(),
        );

        // Renumeracja obejmuje cały kurs, nie tylko przestawione lekcje.
        $this->assertSame(1, $third->fresh()->sequence_order);
        $this->assertSame(2, $first->fresh()->sequence_order);
        $this->assertSame(3, $second->fresh()->sequence_order);

        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($course->id, $entry->subject_id);
        $this->assertSame('lessons.reordered', $entry->details['op']);
    }

    public function test_incomplete_lesson_permutation_is_rejected_and_changes_nothing(): void
    {
        $course = $this->course('etap-1', 1);
        $first = $this->lesson($course, 'Lekcja A', 1);
        $second = $this->lesson($course, 'Lekcja B', 2);

        $this->actingAsAdmin();

        // Pominięcie lekcji zostawiłoby po renumeracji duplikat pozycji, a
        // `sequence_order` nie ma w bazie unikalności.
        $this->patchJson("/api/v1/admin/courses/{$course->id}/lessons/reorder", [
            'lesson_ids' => [$second->id],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['lesson_ids']]]);

        $this->assertSame(1, $first->fresh()->sequence_order);
        $this->assertSame(2, $second->fresh()->sequence_order);
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_a_lesson_from_another_course_may_not_enter_the_order(): void
    {
        $course = $this->course('etap-1', 1);
        $own = $this->lesson($course, 'Lekcja A', 1);

        $other = $this->course('etap-2', 2);
        $foreign = $this->lesson($other, 'Cudza lekcja', 1);

        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/courses/{$course->id}/lessons/reorder", [
            'lesson_ids' => [$own->id, $foreign->id],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(1, $own->fresh()->sequence_order);
        $this->assertSame(1, $foreign->fresh()->sequence_order);
    }

    public function test_duplicated_identifiers_are_rejected_as_a_field_error(): void
    {
        $course = $this->course('etap-1', 1);
        $first = $this->lesson($course, 'Lekcja A', 1);
        $second = $this->lesson($course, 'Lekcja B', 2);

        $this->actingAsAdmin();

        // Duplikat udaje pełną permutację co do liczby elementów, a po
        // renumeracji zostawiłby dwie lekcje na tej samej pozycji.
        $this->patchJson("/api/v1/admin/courses/{$course->id}/lessons/reorder", [
            'lesson_ids' => [$first->id, $first->id],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(1, $first->fresh()->sequence_order);
        $this->assertSame(2, $second->fresh()->sequence_order);
    }

    public function test_drafts_hold_their_place_in_the_path(): void
    {
        $first = $this->course('etap-1', 1, published: true);
        $draft = $this->course('szkic', 2);
        $third = $this->course('etap-3', 3, published: true);

        $this->actingAsAdmin();

        // Szkic zajmuje pozycję w ścieżce, więc pominięcie go jest niepełną
        // permutacją — inaczej renumeracja zostawiłaby duplikat.
        $this->patchJson('/api/v1/admin/courses/reorder', [
            'course_ids' => [$first->id, $third->id],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->patchJson('/api/v1/admin/courses/reorder', [
            'course_ids' => [$third->id, $draft->id, $first->id],
        ])->assertOk();

        $this->assertSame(1, $third->fresh()->sequence_order);
        $this->assertSame(2, $draft->fresh()->sequence_order);
        $this->assertSame(3, $first->fresh()->sequence_order);
    }

    public function test_course_reorder_leaves_the_path_numbered_one_to_n(): void
    {
        $this->seed();
        $admin = $this->actingAsAdmin();

        $target = $this->thirdBeforeSecond($this->pathOrder());

        $response = $this->patchJson('/api/v1/admin/courses/reorder', ['course_ids' => $target])
            ->assertOk();

        $this->assertSame($target, collect($response->json('data'))->pluck('id')->all());
        $this->assertSame(
            range(1, count($target)),
            collect($response->json('data'))->pluck('sequence_order')->all(),
        );

        $positions = Course::query()
            ->whereNotNull('sequence_order')
            ->orderBy('sequence_order')
            ->pluck('sequence_order', 'id')
            ->all();

        $this->assertSame($target, array_keys($positions), 'Kursy muszą stać w żądanej kolejności.');
        $this->assertSame(range(1, count($target)), array_values($positions), 'Pozycje muszą być unikalne 1..N.');

        // Kurs spoza ścieżki (webinar) nie może zostać w nią wciągnięty.
        $this->assertSame(1, Course::query()->whereNull('sequence_order')->count());

        $entry = AuditLogEntry::where('action', 'course.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame('courses.reordered', $entry->details['op']);
        $this->assertSame($target, $entry->details['course_ids']);
    }

    public function test_course_reorder_preserves_every_progress_row(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $progressBefore = LessonProgress::count();
        $attemptsBefore = TestAttempt::count();

        // Bez postępu w bazie test niczego by nie pilnował.
        $this->assertGreaterThan(0, $progressBefore);
        $this->assertGreaterThan(0, $attemptsBefore);

        $this->patchJson('/api/v1/admin/courses/reorder', [
            'course_ids' => $this->thirdBeforeSecond($this->pathOrder()),
        ])->assertOk();

        // Kryterium 3 karty pakietu mówi o zachowaniu danych, nie o pozycjach.
        $this->assertSame($progressBefore, LessonProgress::count());
        $this->assertSame($attemptsBefore, TestAttempt::count());
    }

    public function test_incomplete_course_permutation_is_rejected_and_changes_nothing(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $before = $this->positionsById();
        $incomplete = $this->pathOrder();
        array_pop($incomplete);

        $this->patchJson('/api/v1/admin/courses/reorder', ['course_ids' => $incomplete])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['course_ids']]]);

        $this->assertSame($before, $this->positionsById());
    }

    public function test_a_course_outside_the_path_may_not_be_reordered_into_it(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $webinar = Course::query()->whereNull('sequence_order')->firstOrFail();

        $order = $this->pathOrder();
        $order[] = $webinar->id;

        $this->patchJson('/api/v1/admin/courses/reorder', ['course_ids' => $order])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertNull($webinar->fresh()->sequence_order);
    }

    public function test_impact_preview_announces_martas_transitions_and_writes_nothing(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $second = Course::where('sequence_order', 2)->firstOrFail();
        $third = Course::where('sequence_order', 3)->firstOrFail();

        $before = $this->positionsById();

        $rows = $this->postJson('/api/v1/admin/courses/reorder/preview', [
            'course_ids' => $this->thirdBeforeSecond($this->pathOrder()),
        ])->assertOk()->json('data');

        // Seed §3: marta ma etap 1 `completed` (test zdany), etap 2 `in_progress`,
        // etapy 3-10 `locked`. Po przestawieniu etapu 3 przed 2 poprzednikiem
        // etapu 2 staje się nieukończony etap 3 (→ `locked`), a poprzednikiem
        // etapu 3 staje się ukończony etap 1 (→ `in_progress`).
        $this->assertSame([
            [
                'user_id' => $marta->id,
                'first_name' => $marta->first_name,
                'last_name' => $marta->last_name,
                'course_id' => $second->id,
                'course_title' => $second->title,
                'from' => 'in_progress',
                'to' => 'locked',
            ],
            [
                'user_id' => $marta->id,
                'first_name' => $marta->first_name,
                'last_name' => $marta->last_name,
                'course_id' => $third->id,
                'course_title' => $third->title,
                'from' => 'locked',
                'to' => 'in_progress',
            ],
        ], $rows);

        // Podgląd mierzy na transakcji, z której wychodzi wyjątkiem — po
        // żądaniu w bazie nie może zostać żadna zmiana pozycji.
        $this->assertSame($before, $this->positionsById());
    }

    public function test_impact_preview_of_an_unchanged_order_lists_nobody(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $this->postJson('/api/v1/admin/courses/reorder/preview', ['course_ids' => $this->pathOrder()])
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_impact_preview_rejects_an_incomplete_permutation(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $incomplete = $this->pathOrder();
        array_shift($incomplete);

        $this->postJson('/api/v1/admin/courses/reorder/preview', ['course_ids' => $incomplete])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_the_preview_matches_what_the_real_reorder_does(): void
    {
        $this->seed();
        $this->actingAsAdmin();

        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $target = $this->thirdBeforeSecond($this->pathOrder());

        $announced = collect($this->postJson('/api/v1/admin/courses/reorder/preview', ['course_ids' => $target])
            ->assertOk()
            ->json('data'))
            ->where('user_id', $marta->id)
            ->mapWithKeys(fn (array $row): array => [$row['course_id'] => $row['to']])
            ->all();

        $this->assertNotEmpty($announced, 'Bez zapowiedzianych przejść test niczego nie porównuje.');

        $this->patchJson('/api/v1/admin/courses/reorder', ['course_ids' => $target])->assertOk();

        Sanctum::actingAs($marta);

        $catalogue = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))->keyBy('id');

        // Podgląd liczy tą samą regułą co ścieżka uczestnika (CourseAccess) —
        // gdyby liczył własną, modal kłamałby przed potwierdzeniem.
        foreach ($announced as $courseId => $expected) {
            $this->assertSame(
                $expected,
                $catalogue[$courseId]['status'],
                "Kurs {$courseId}: realny status nie zgadza się z zapowiedzią podglądu.",
            );
        }
    }

    /**
     * Identyfikatory kursów ścieżki w obecnej kolejności.
     *
     * @return list<int>
     */
    private function pathOrder(): array
    {
        return Course::query()
            ->whereNotNull('sequence_order')
            ->orderBy('sequence_order')
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * Scenariusz z planu fazy 4: kurs 3 przed kurs 2.
     *
     * @param  list<int>  $order
     * @return list<int>
     */
    private function thirdBeforeSecond(array $order): array
    {
        return array_values(array_merge(
            [$order[0], $order[2], $order[1]],
            array_slice($order, 3),
        ));
    }

    /**
     * @return array<int, int|null>
     */
    private function positionsById(): array
    {
        return Course::query()
            ->orderBy('id')
            ->pluck('sequence_order', 'id')
            ->all();
    }

    private function course(string $slug, ?int $sequenceOrder = null, bool $published = false): Course
    {
        return Course::create([
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $sequenceOrder,
            'is_published' => $published,
        ]);
    }

    private function lesson(Course $course, string $title, int $sequenceOrder): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => $title,
            'sequence_order' => $sequenceOrder,
            'duration_seconds' => 600,
        ]);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        return $admin;
    }
}
