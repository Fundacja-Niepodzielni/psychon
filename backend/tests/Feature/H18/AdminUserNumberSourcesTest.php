<?php

namespace Tests\Feature\H18;

use App\Models\Course;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pakiet H18 · GET /admin/users/{id}/number-sources — pięć sekcji wierszy
 * stojących za liczbami karty osoby, w kształcie wiersza z kontraktu API.
 *
 * Kryterium (punkt 4 pisma): `sum` każdej sekcji ma być RÓWNE liczbie z tej
 * samej osoby pokazywanej gdzie indziej — `hours_accepted` / `supervision_present`
 * / `workshop_done` / `path_tests_passed` z karty osoby (`AdminUserCardResource`),
 * `reliability` z `GET /admin/reliability/{userId}`. Każda noga poniżej ma
 * kontrolę dodatnią: dodany/zmieniony rekord przesuwa OBIE liczby razem.
 */
class AdminUserNumberSourcesTest extends TestCase
{
    use RefreshDatabase;

    private Edition $edition;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::factory()->create();
        $this->admin = User::factory()->role('project_manager')->create([
            'edition_id' => $this->edition->id,
        ]);
    }

    private function participant(string $email = 'osoba@demo.pl'): User
    {
        return User::factory()->create([
            'edition_id' => $this->edition->id,
            'role' => 'volunteer',
            'status' => 'active',
            'email' => $email,
        ]);
    }

    private function cardProgress(User $user): array
    {
        return $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$user->id}")
            ->assertOk()
            ->json('data.progress');
    }

    private function reliabilityPercentFromEndpoint(User $user): ?string
    {
        return $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/reliability/{$user->id}")
            ->json('data.reliability_percent');
    }

    private function pathCourse(int $order, bool $withTest = true): Course
    {
        $course = Course::create([
            'title' => "Kurs sciezki {$order}",
            'slug' => 'kurs-numery-'.$order.'-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $this->edition->id,
            'is_published' => true,
        ]);

        if ($withTest) {
            $course->test()->create([
                'pass_threshold' => null,
                'attempts_limit' => null,
                'question_count' => 1,
            ]);
        }

        return $course->fresh();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $person = $this->participant();

        $this->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_roles_without_access_are_forbidden(): void
    {
        $person = $this->participant();

        foreach (['instructor', 'volunteer', 'student'] as $role) {
            $actor = User::factory()->role($role)->create(['edition_id' => $this->edition->id]);

            $this->actingAs($actor, 'keycloak')
                ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    public function test_unknown_person_returns_404(): void
    {
        $this->actingAs($this->admin, 'keycloak')
            ->getJson('/api/v1/admin/users/999999/number-sources')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_person_without_records_has_five_empty_sections_and_null_reliability(): void
    {
        $person = $this->participant('pusta@demo.pl');

        $data = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()
            ->json('data');

        foreach (['hours_accepted', 'supervision_present', 'workshop', 'passed_tests', 'reliability'] as $section) {
            $this->assertSame([], $data[$section]['rows'], "sekcja {$section} ma miec puste wiersze");
        }

        $this->assertSame('0', $data['hours_accepted']['sum']);
        $this->assertSame(0, $data['supervision_present']['sum']);
        $this->assertSame(0, $data['workshop']['sum']);
        $this->assertFalse($data['workshop']['done']);
        $this->assertSame(0, $data['passed_tests']['sum']);
        $this->assertNull($data['reliability']['sum']);

        // Rownosc z karta osoby / punktem rzetelnosci - takze na pustej osobie.
        $card = $this->cardProgress($person);
        $this->assertSame($card['hours_accepted'], $data['hours_accepted']['sum']);
        $this->assertSame($card['supervision_present'], $data['supervision_present']['sum']);
        $this->assertSame($card['workshop_done'], $data['workshop']['done']);
        $this->assertSame($card['path_tests_passed'], $data['passed_tests']['sum']);
        $this->assertSame($this->reliabilityPercentFromEndpoint($person), $data['reliability']['sum']);
    }

    public function test_hours_accepted_sum_matches_card_with_positive_control(): void
    {
        $person = $this->participant('staz@demo.pl');

        $before = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()
            ->json('data.hours_accepted');
        $this->assertSame([], $before['rows']);
        $this->assertSame('0', $before['sum']);
        $this->assertSame($this->cardProgress($person)['hours_accepted'], $before['sum']);

        // Wpis submitted NIE wchodzi do sumy zaakceptowanej.
        InternshipEntry::create([
            'user_id' => $person->id,
            'date' => '2026-08-20',
            'hours' => '2.0',
            'form' => 'chat_duty',
            'consultations_count' => 1,
            'description' => 'Wpis oczekujacy.',
            'status' => 'submitted',
        ]);
        $entry = InternshipEntry::create([
            'user_id' => $person->id,
            'date' => '2026-08-21',
            'hours' => '3.5',
            'form' => 'phone_duty',
            'consultations_count' => 4,
            'description' => 'Dyzur telefoniczny.',
            'status' => 'accepted',
        ]);

        $after = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()
            ->json('data.hours_accepted');

        // Kontrola dodatnia: obie liczby (karta i zrodlo) przesuwaja sie RAZEM.
        $this->assertSame('3.5', $after['sum']);
        $this->assertSame($this->cardProgress($person)['hours_accepted'], $after['sum']);
        $this->assertCount(1, $after['rows']);

        $row = $after['rows'][0];
        $this->assertSame('2026-08-21', $row['date']);
        $this->assertNull($row['occurred_at']);
        $this->assertSame('3.5', $row['value']);
        $this->assertSame('accepted', $row['state']);
        $this->assertSame('phone_duty', $row['form']);
        $this->assertArrayNotHasKey('source', $row);
        $this->assertNotNull($entry->id);
    }

    public function test_supervision_present_sum_matches_card_with_positive_control(): void
    {
        $person = $this->participant('superwizja@demo.pl');
        $supervisor = User::factory()->role('instructor')->create([
            'edition_id' => $this->edition->id,
            'first_name' => 'Joanna',
            'last_name' => 'Prowadzaca',
        ]);
        $slot = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id,
            'starts_at' => now()->subDay(),
            'duration_minutes' => 60,
            'seats_limit' => 5,
            'location_or_link' => 'Sala 1',
        ]);

        $before = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.supervision_present');
        $this->assertSame([], $before['rows']);
        $this->assertSame(0, $before['sum']);

        // Nieobecnosc NIE wchodzi do sumy obecnosci.
        SupervisionSignup::create([
            'slot_id' => $slot->id,
            'user_id' => $person->id,
            'signed_up_at' => now()->subDays(2),
            'attendance' => 'absent',
        ]);
        $otherSlot = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id,
            'starts_at' => now()->subHours(3),
            'duration_minutes' => 60,
            'seats_limit' => 5,
            'location_or_link' => 'Sala 2',
        ]);
        SupervisionSignup::create([
            'slot_id' => $otherSlot->id,
            'user_id' => $person->id,
            'signed_up_at' => now()->subDays(2),
            'attendance' => 'present',
        ]);

        $after = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.supervision_present');

        $this->assertSame(1, $after['sum']);
        $this->assertSame($this->cardProgress($person)['supervision_present'], $after['sum']);
        $this->assertCount(1, $after['rows']);

        $row = $after['rows'][0];
        $this->assertNull($row['date']);
        $this->assertNotNull($row['occurred_at']);
        $this->assertSame(1, $row['value']);
        $this->assertSame('present', $row['state']);
        $this->assertNull($row['form']);
        $this->assertSame('Joanna Prowadzaca', $row['label']);
    }

    public function test_workshop_sum_and_done_match_card_with_positive_control(): void
    {
        $person = $this->participant('warsztat@demo.pl');

        $before = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.workshop');
        $this->assertSame([], $before['rows']);
        $this->assertSame(0, $before['sum']);
        $this->assertFalse($before['done']);

        WorkshopCompletion::create([
            'user_id' => $person->id,
            'edition_id' => $this->edition->id,
            'completed_at' => now(),
            'marked_by' => $this->admin->id,
        ]);

        $after = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.workshop');

        $this->assertSame(1, $after['sum']);
        $this->assertTrue($after['done']);
        $card = $this->cardProgress($person);
        $this->assertSame($card['workshop_done'], $after['done']);
        $this->assertCount(1, $after['rows']);

        $row = $after['rows'][0];
        $this->assertNull($row['date']);
        $this->assertNotNull($row['occurred_at']);
        $this->assertSame('completed', $row['state']);
        $this->assertNull($row['form']);
    }

    public function test_passed_tests_sum_matches_path_tests_passed_with_positive_control(): void
    {
        $person = $this->participant('testy@demo.pl');
        $course1 = $this->pathCourse(1);
        $this->pathCourse(2);
        // Kurs bez testu - w mianowniku sciezki (courses_total), ale poza `passed_tests`.
        $this->pathCourse(3, withTest: false);

        $before = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.passed_tests');
        $this->assertSame([], $before['rows']);
        $this->assertSame(0, $before['sum']);
        $this->assertSame($this->cardProgress($person)['path_tests_passed'], $before['sum']);

        // Podejscie niezaliczone NIE wchodzi.
        TestAttempt::create([
            'user_id' => $person->id,
            'test_id' => $course1->test->id,
            'attempt_number' => 1,
            'answers' => [],
            'questions_snapshot' => [],
            'score_percent' => 0,
            'passed' => false,
        ]);
        TestAttempt::create([
            'user_id' => $person->id,
            'test_id' => $course1->test->id,
            'attempt_number' => 2,
            'answers' => [],
            'questions_snapshot' => [],
            'score_percent' => 100,
            'passed' => true,
        ]);

        $after = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.passed_tests');

        $this->assertSame(1, $after['sum']);
        $this->assertSame($this->cardProgress($person)['path_tests_passed'], $after['sum']);
        $this->assertCount(1, $after['rows']);

        $row = $after['rows'][0];
        $this->assertNull($row['date']);
        $this->assertNotNull($row['occurred_at']);
        $this->assertSame('passed', $row['state']);
        $this->assertNull($row['form']);
        $this->assertSame('Kurs sciezki 1', $row['label']);
    }

    public function test_reliability_sum_matches_reliability_endpoint_with_positive_control(): void
    {
        $person = $this->participant('rzetelnosc@demo.pl');
        $course = Course::create([
            'title' => 'Kurs rzetelnosci',
            'slug' => 'kurs-rzetelnosci-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'edition_id' => $this->edition->id,
            'is_published' => true,
        ]);
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja pomiarowa',
            'duration_seconds' => 100,
            'video_provider_id' => 'mock-pomiarowa-'.uniqid(),
            'sequence_order' => 1,
        ]);

        $before = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.reliability');
        $this->assertSame([], $before['rows']);
        $this->assertNull($before['sum']);
        $this->assertNull($this->reliabilityPercentFromEndpoint($person));

        LessonProgress::create([
            'user_id' => $person->id,
            'lesson_id' => $lesson->id,
            'watched_seconds' => 50,
            'active_seconds' => 50,
            'open_count' => 1,
            'last_activity_at' => now(),
            'is_completed' => true,
            'completed_at' => now(),
        ]);

        $after = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.reliability');

        $this->assertSame('50', $after['sum']);
        $this->assertSame($this->reliabilityPercentFromEndpoint($person), $after['sum']);
        $this->assertCount(1, $after['rows']);

        $row = $after['rows'][0];
        $this->assertNull($row['date']);
        $this->assertNotNull($row['occurred_at']);
        $this->assertSame(50, $row['value']);
        $this->assertSame('completed', $row['state']);
        $this->assertNull($row['form']);
        $this->assertSame('Lekcja pomiarowa', $row['label']);
    }
}
