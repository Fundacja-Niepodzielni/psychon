<?php

namespace Tests\Feature\H10;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\Test;
use App\Models\TestAnswer;
use App\Models\TestQuestion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Prowadzący zarządza pytaniami testu końcowego kursów, które prowadzi —
 * cztery trasy `role:instructor` w `routes/api/h10.php`. Kształt żądań i
 * odpowiedzi jest ten sam co w panelu administracji (te same żądania, ta sama
 * usługa banku pytań); różni je wyłącznie zasięg. Test albo pytanie kursu spoza
 * zasięgu prowadzącego wygląda na zewnątrz tak samo jak nieistniejące: ten sam
 * status i te same bajty odpowiedzi, odmowa przed walidacją ciała, bez zapisu.
 */
class InstructorQuestionBankTest extends TestPackageCase
{
    use RefreshDatabase;

    /** @var array<string, mixed> */
    private const array VALID_QUESTION = [
        'body' => 'Nowe pytanie?',
        'answers' => [
            ['body' => 'A', 'is_correct' => true],
            ['body' => 'B', 'is_correct' => false],
            ['body' => 'C', 'is_correct' => false],
        ],
    ];

    public function test_assigned_instructor_lists_creates_edits_and_deletes_questions_of_own_course(): void
    {
        $test = $this->makeTest(questions: 2);
        $this->actingAs($this->assignInstructor($test->course), 'keycloak');

        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.answers.0.is_correct', true)
            ->assertJsonPath('data.0.answers.1.is_correct', false);

        $created = $this->postJson("/api/v1/instructor/tests/{$test->id}/questions", self::VALID_QUESTION)
            ->assertCreated()
            ->assertJsonPath('data.body', 'Nowe pytanie?')
            ->assertJsonPath('data.sequence_order', 3)
            ->assertJsonCount(3, 'data.answers')
            ->json('data');

        $this->assertSame($test->id, TestQuestion::query()->findOrFail($created['id'])->test_id);

        $answers = collect($created['answers']);
        $this->patchJson("/api/v1/instructor/questions/{$created['id']}", [
            'body' => 'Zmienione pytanie?',
            'answers' => [
                ['id' => $answers[0]['id'], 'body' => 'A2', 'is_correct' => false],
                ['id' => $answers[1]['id'], 'body' => 'B2', 'is_correct' => true],
            ],
        ])->assertOk()
            ->assertJsonPath('data.body', 'Zmienione pytanie?')
            ->assertJsonCount(2, 'data.answers')
            ->assertJsonPath('data.answers.1.is_correct', true);

        $this->deleteJson("/api/v1/instructor/questions/{$created['id']}")
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $created['id'], 'deleted' => true]]);

        $this->assertDatabaseMissing('test_questions', ['id' => $created['id']]);
        $this->assertSame(0, AuditLogEntry::count(), 'Rejestr audytu nie przewiduje zapisów banku pytań (jak w administracji).');
    }

    public function test_responses_have_the_same_shape_as_in_administration(): void
    {
        $adminTest = $this->makeTest(questions: 2);
        $ownTest = $this->makeTest(questions: 2);
        $instructor = $this->assignInstructor($ownTest->course);

        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');
        $adminList = $this->getJson("/api/v1/admin/tests/{$adminTest->id}/questions");
        $adminCreated = $this->postJson("/api/v1/admin/tests/{$adminTest->id}/questions", self::VALID_QUESTION);
        $adminUpdated = $this->patchJson("/api/v1/admin/questions/{$adminCreated->json('data.id')}", ['body' => 'Zmiana']);
        $adminDeleted = $this->deleteJson("/api/v1/admin/questions/{$adminCreated->json('data.id')}");

        $this->actingAs($instructor, 'keycloak');
        $ownList = $this->getJson("/api/v1/instructor/tests/{$ownTest->id}/questions");
        $ownCreated = $this->postJson("/api/v1/instructor/tests/{$ownTest->id}/questions", self::VALID_QUESTION);
        $ownUpdated = $this->patchJson("/api/v1/instructor/questions/{$ownCreated->json('data.id')}", ['body' => 'Zmiana']);
        $ownDeleted = $this->deleteJson("/api/v1/instructor/questions/{$ownCreated->json('data.id')}");

        foreach ([[$adminList, $ownList, 200], [$adminCreated, $ownCreated, 201], [$adminUpdated, $ownUpdated, 200], [$adminDeleted, $ownDeleted, 200]] as $i => [$admin, $own, $status]) {
            $this->assertSame($status, $admin->status(), "administracja #{$i}");
            $this->assertSame($status, $own->status(), "prowadzący #{$i}");
            $this->assertSame(
                $this->withoutIds($admin->json()),
                $this->withoutIds($own->json()),
                "kształt odpowiedzi #{$i}",
            );
        }
    }

    public function test_validation_failures_match_administration_on_an_own_course(): void
    {
        $adminTest = $this->makeTest(questions: 1);
        $ownTest = $this->makeTest(questions: 1);
        $instructor = $this->assignInstructor($ownTest->course);
        $adminQuestion = $adminTest->questions()->firstOrFail();
        $ownQuestion = $ownTest->questions()->firstOrFail();

        $bodies = [
            'brak pól' => [],
            'dwie poprawne' => ['body' => 'X', 'answers' => [['body' => 'A', 'is_correct' => true], ['body' => 'B', 'is_correct' => true]]],
            'brak poprawnej' => ['body' => 'X', 'answers' => [['body' => 'A', 'is_correct' => false], ['body' => 'B', 'is_correct' => false]]],
            'jedna odpowiedź' => ['body' => 'X', 'answers' => [['body' => 'A', 'is_correct' => true]]],
            'za długa treść' => ['body' => str_repeat('x', 2001), 'answers' => self::VALID_QUESTION['answers']],
        ];

        foreach ($bodies as $label => $body) {
            $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
            $adminStore = $this->postJson("/api/v1/admin/tests/{$adminTest->id}/questions", $body);
            $adminUpdate = $this->patchJson("/api/v1/admin/questions/{$adminQuestion->id}", $body);

            $this->actingAs($instructor, 'keycloak');
            $ownStore = $this->postJson("/api/v1/instructor/tests/{$ownTest->id}/questions", $body);
            $ownUpdate = $this->patchJson("/api/v1/instructor/questions/{$ownQuestion->id}", $body);

            $this->assertSame(422, $ownStore->status(), "POST: {$label}");
            $this->assertSame($adminStore->status(), $ownStore->status(), "POST: {$label}");
            $this->assertSame($adminStore->getContent(), $ownStore->getContent(), "POST: {$label}");
            $this->assertSame($adminUpdate->status(), $ownUpdate->status(), "PATCH: {$label}");
            // Puste ciało PATCH jest w administracji poprawne (200), a ciało zawiera id pytania — porównujemy kształt.
            $this->assertSame($this->withoutIds($adminUpdate->json()), $this->withoutIds($ownUpdate->json()), "PATCH: {$label}");
        }
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function routeKinds(): array
    {
        return [
            'GET lista' => ['GET', 'tests/%d/questions'],
            'POST dodanie' => ['POST', 'tests/%d/questions'],
            'PATCH edycja' => ['PATCH', 'questions/%d'],
            'DELETE usunięcie' => ['DELETE', 'questions/%d'],
        ];
    }

    #[DataProvider('routeKinds')]
    public function test_foreign_resource_looks_exactly_like_a_missing_one_even_with_an_invalid_body(string $method, string $pattern): void
    {
        $foreign = $this->makeTest(questions: 2);
        $this->assignInstructor($foreign->course);
        $own = $this->makeTest(questions: 1);
        $instructor = $this->assignInstructor($own->course);
        $this->actingAs($instructor, 'keycloak');

        $isTestRoute = str_starts_with($pattern, 'tests/');
        $foreignId = $isTestRoute ? $foreign->id : $foreign->questions()->firstOrFail()->id;
        $ownId = $isTestRoute ? $own->id : $own->questions()->firstOrFail()->id;
        $missingId = ($isTestRoute ? (int) Test::query()->max('id') : (int) TestQuestion::query()->max('id')) + 1000;
        $beforeDb = $this->snapshot();

        // Noga obronna: ta sama trasa na własnym zasobie działa (nie 404 z braku trasy).
        $valid = match ($method) {
            'POST' => self::VALID_QUESTION,
            'PATCH' => ['body' => 'Zmiana'],
            default => [],
        };
        $ownResponse = $this->json($method, '/api/v1/instructor/'.sprintf($pattern, $ownId), $valid);
        $this->assertContains($ownResponse->status(), [200, 201], "{$method} {$pattern} na własnym zasobie");
        $afterOwn = $this->snapshot();

        $bodies = match ($method) {
            'POST', 'PATCH' => [
                'poprawne' => $valid,
                'puste' => [],
                'błędne' => ['body' => str_repeat('x', 5000), 'answers' => [['body' => 'A', 'is_correct' => true], ['body' => 'B', 'is_correct' => true]]],
            ],
            default => ['bez ciała' => []],
        };

        foreach ($bodies as $label => $body) {
            $foreignResponse = $this->json($method, '/api/v1/instructor/'.sprintf($pattern, $foreignId), $body);
            $missingResponse = $this->json($method, '/api/v1/instructor/'.sprintf($pattern, $missingId), $body);

            $this->assertSame(404, $foreignResponse->status(), "{$method} {$pattern}: cudzy, {$label}");
            $this->assertSame(404, $missingResponse->status(), "{$method} {$pattern}: nieistniejący, {$label}");
            $this->assertSame('not_found', $foreignResponse->json('error.code'));
            $this->assertSame($missingResponse->getContent(), $foreignResponse->getContent(), "{$method} {$pattern}: bajty, {$label}");
        }

        $this->assertSame($afterOwn, $this->snapshot(), 'Odmowy nic nie zapisały.');

        if ($method !== 'GET') {
            $this->assertNotSame($beforeDb, $afterOwn, 'Kontrola: zapis na własnym zasobie zmienia bazę, więc porównanie „nic się nie zmieniło” coś mierzy.');
        }
    }

    public function test_the_refusal_is_the_same_one_the_topic_routes_give(): void
    {
        $foreign = $this->makeTest(questions: 1);
        $this->assignInstructor($foreign->course);
        $own = $this->makeTest(questions: 1);
        $this->actingAs($this->assignInstructor($own->course), 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$own->id}/questions")->assertOk();

        $topicRefusal = $this->getJson('/api/v1/instructor/courses/'.((int) Course::query()->max('id') + 1000).'/topics');
        $bankRefusal = $this->getJson("/api/v1/instructor/tests/{$foreign->id}/questions");

        $this->assertSame(404, $bankRefusal->status());
        $this->assertSame($topicRefusal->getContent(), $bankRefusal->getContent());
        $this->assertSame('Nie znaleziono zasobu.', $bankRefusal->json('error.message'));
    }

    public function test_an_id_outside_the_integer_range_is_the_same_refusal(): void
    {
        $own = $this->makeTest(questions: 1);
        $this->actingAs($this->assignInstructor($own->course), 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$own->id}/questions")->assertOk();
        $missingTest = (int) Test::query()->max('id') + 1000;
        $missingQuestion = (int) TestQuestion::query()->max('id') + 1000;

        foreach ([
            ['GET', 'tests/%s/questions', $missingTest, '99999999999999999999999'],
            ['POST', 'tests/%s/questions', $missingTest, '99999999999999999999999'],
            ['PATCH', 'questions/%s', $missingQuestion, '99999999999999999999999'],
            ['DELETE', 'questions/%s', $missingQuestion, '99999999999999999999999'],
        ] as [$method, $pattern, $missingId, $hugeId]) {
            $missing = $this->json($method, '/api/v1/instructor/'.sprintf($pattern, $missingId), self::VALID_QUESTION);
            $huge = $this->json($method, '/api/v1/instructor/'.sprintf($pattern, $hugeId), self::VALID_QUESTION);

            $this->assertSame(404, $huge->status(), "{$method} {$pattern}");
            $this->assertSame($missing->getContent(), $huge->getContent(), "{$method} {$pattern}");
        }
    }

    public function test_instructor_without_any_assignment_is_refused_on_every_route(): void
    {
        $test = $this->makeTest(questions: 2);
        $question = $test->questions()->firstOrFail();
        $this->actingAs($this->assignInstructor($test->course), 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertOk();

        $this->actingAs(User::factory()->role('instructor')->create(), 'keycloak');
        $before = $this->snapshot();

        $this->assertSame(404, $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->status());
        $this->assertSame(404, $this->postJson("/api/v1/instructor/tests/{$test->id}/questions", self::VALID_QUESTION)->status());
        $this->assertSame(404, $this->patchJson("/api/v1/instructor/questions/{$question->id}", ['body' => 'Zmiana'])->status());
        $this->assertSame(404, $this->deleteJson("/api/v1/instructor/questions/{$question->id}")->status());
        $this->assertSame($before, $this->snapshot());
    }

    public function test_a_removed_assignment_no_longer_gives_access(): void
    {
        $test = $this->makeTest(questions: 2);
        $question = $test->questions()->firstOrFail();
        $instructor = $this->assignInstructor($test->course);
        $this->actingAs($instructor, 'keycloak');

        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertOk();

        CourseAssignment::query()->where('instructor_id', $instructor->id)->update(['unassigned_at' => now()]);
        $before = $this->snapshot();

        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertStatus(404);
        $this->postJson("/api/v1/instructor/tests/{$test->id}/questions", self::VALID_QUESTION)->assertStatus(404);
        $this->patchJson("/api/v1/instructor/questions/{$question->id}", ['body' => 'Zmiana'])->assertStatus(404);
        $this->deleteJson("/api/v1/instructor/questions/{$question->id}")->assertStatus(404);
        $this->assertSame($before, $this->snapshot());
    }

    public function test_a_lesson_level_assignment_is_not_a_course_assignment(): void
    {
        $test = $this->makeTest(questions: 1);
        $lesson = Lesson::create(['course_id' => $test->course_id, 'title' => 'Lekcja', 'sequence_order' => 1, 'duration_seconds' => 600]);
        $instructor = User::factory()->role('instructor')->create();
        CourseAssignment::create(['course_id' => $test->course_id, 'lesson_id' => $lesson->id, 'instructor_id' => $instructor->id, 'assigned_at' => now()]);

        $this->actingAs($this->assignInstructor($test->course), 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertOk();

        $this->actingAs($instructor, 'keycloak');

        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertStatus(404);
    }

    public function test_a_question_of_another_course_is_not_reachable_through_own_assignment(): void
    {
        $own = $this->makeTest(questions: 1);
        $other = $this->makeTest(questions: 2);
        $otherQuestion = $other->questions()->firstOrFail();
        $this->actingAs($this->assignInstructor($own->course), 'keycloak');
        $before = $this->snapshot();

        $this->getJson("/api/v1/instructor/tests/{$own->id}/questions")->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson("/api/v1/instructor/questions/{$otherQuestion->id}", ['body' => 'Przejęte'])->assertStatus(404);
        $this->deleteJson("/api/v1/instructor/questions/{$otherQuestion->id}")->assertStatus(404);
        $this->postJson("/api/v1/instructor/tests/{$other->id}/questions", self::VALID_QUESTION)->assertStatus(404);
        $this->assertSame($before, $this->snapshot());
        $this->assertSame('Pytanie 1?', $otherQuestion->fresh()->body);
    }

    public function test_a_soft_deleted_course_is_out_of_scope(): void
    {
        $test = $this->makeTest(questions: 1);
        $instructor = $this->assignInstructor($test->course);
        $this->actingAs($instructor, 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertOk();
        $test->course->delete();

        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertStatus(404);
    }

    public function test_the_assignment_is_the_only_thing_that_matters_not_the_users_own_role_column(): void
    {
        $test = $this->makeTest(questions: 1);
        $assigned = $this->assignInstructor($test->course);
        $other = User::factory()->role('instructor')->create();

        $this->actingAs($other, 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertStatus(404);

        $this->actingAs($assigned, 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertOk();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function nonInstructorRoles(): array
    {
        return [
            'wolontariusz' => ['volunteer'],
            'student' => ['student'],
            'opiekun projektu' => ['project_manager'],
            'super admin' => ['super_admin'],
        ];
    }

    #[DataProvider('nonInstructorRoles')]
    public function test_other_roles_are_forbidden_whether_the_id_exists_or_not(string $role): void
    {
        $test = $this->makeTest(questions: 2);
        $question = $test->questions()->firstOrFail();
        $this->assignInstructor($test->course);
        $this->actingAs(User::factory()->role($role)->create(), 'keycloak');
        $before = $this->snapshot();
        $missingTest = (int) Test::query()->max('id') + 1000;
        $missingQuestion = (int) TestQuestion::query()->max('id') + 1000;

        foreach ([
            ['GET', "tests/{$test->id}/questions", "tests/{$missingTest}/questions", []],
            ['POST', "tests/{$test->id}/questions", "tests/{$missingTest}/questions", self::VALID_QUESTION],
            ['PATCH', "questions/{$question->id}", "questions/{$missingQuestion}", ['body' => 'Zmiana']],
            ['DELETE', "questions/{$question->id}", "questions/{$missingQuestion}", []],
        ] as [$method, $existing, $missing, $body]) {
            $existingResponse = $this->json($method, "/api/v1/instructor/{$existing}", $body);
            $missingResponse = $this->json($method, "/api/v1/instructor/{$missing}", $body);

            $this->assertSame(403, $existingResponse->status(), "{$role} {$method} {$existing}");
            $this->assertSame('forbidden', $existingResponse->json('error.code'));
            $this->assertSame($existingResponse->getContent(), $missingResponse->getContent());
        }

        $this->assertSame($before, $this->snapshot());
    }

    public function test_guest_is_unauthenticated_on_every_route(): void
    {
        $test = $this->makeTest(questions: 1);
        $question = $test->questions()->firstOrFail();
        $before = $this->snapshot();

        foreach ([
            $this->getJson("/api/v1/instructor/tests/{$test->id}/questions"),
            $this->postJson("/api/v1/instructor/tests/{$test->id}/questions", self::VALID_QUESTION),
            $this->patchJson("/api/v1/instructor/questions/{$question->id}", ['body' => 'Zmiana']),
            $this->deleteJson("/api/v1/instructor/questions/{$question->id}"),
        ] as $response) {
            $response->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
        }

        $this->assertSame($before, $this->snapshot());
    }

    public function test_instructor_is_still_forbidden_on_the_administration_bank(): void
    {
        $test = $this->makeTest(questions: 1);
        $this->actingAs($this->assignInstructor($test->course), 'keycloak');

        $this->getJson("/api/v1/instructor/tests/{$test->id}/questions")->assertOk();
        $this->getJson("/api/v1/admin/tests/{$test->id}/questions")->assertStatus(403)->assertJsonPath('error.code', 'forbidden');
    }

    public function test_non_numeric_ids_do_not_reach_the_controllers(): void
    {
        $own = $this->makeTest(questions: 1);
        $this->actingAs($this->assignInstructor($own->course), 'keycloak');
        $this->getJson("/api/v1/instructor/tests/{$own->id}/questions")->assertOk();

        $this->getJson('/api/v1/instructor/tests/abc/questions')->assertStatus(404);
        $this->deleteJson('/api/v1/instructor/questions/abc')->assertStatus(404);
    }

    /**
     * Zapis stanu banku pytań (pytania, odpowiedzi, liczba testów) do porównań
     * „nic się nie zmieniło”.
     *
     * @return array<string, mixed>
     */
    private function snapshot(): array
    {
        return [
            'questions' => TestQuestion::query()->orderBy('id')->get()->toArray(),
            'answers' => TestAnswer::query()->orderBy('id')->get()->toArray(),
            'tests' => Test::query()->orderBy('id')->get()->toArray(),
            'audit' => AuditLogEntry::count(),
        ];
    }

    /**
     * @param  array<mixed>|null  $payload
     * @return array<mixed>|null
     */
    private function withoutIds(?array $payload): ?array
    {
        if ($payload === null) {
            return null;
        }

        array_walk_recursive($payload, static function (mixed &$value, string|int $key): void {
            if ($key === 'id') {
                $value = 0;
            }
        });

        return $payload;
    }

    private function assignInstructor(Course $course): User
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
