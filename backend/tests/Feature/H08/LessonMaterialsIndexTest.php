<?php

namespace Tests\Feature\H08;

use App\Http\Resources\H08\AdminMaterialResource;
use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\EmailMessage;
use App\Models\Lesson;
use App\Models\Material;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Pakiet H08b · `GET /api/v1/admin/lessons/{lesson}/materials` — lista żywych
 * materiałów jednej lekcji w panelu administracji.
 *
 * Oczekiwane wartości pochodzą z aneksu kontraktu „lista materiałów lekcji
 * (H08)” i z kształtu `AdminMaterialResource`, nigdy z tego, co akurat zwraca
 * kod. Wszystkie próby idą przez pełny stos tras (middleware, wiązanie,
 * koperta błędu), a wiersze materiałów są wstawiane wprost, bez plików na
 * dysku.
 */
class LessonMaterialsIndexTest extends TestCase
{
    use RefreshDatabase;

    /** Kształt elementu: dokładnie pola `AdminMaterialResource`, nic więcej. */
    private const array ELEMENT_KEYS = [
        'course_id',
        'created_at',
        'id',
        'lesson_id',
        'mime',
        'name',
        'size',
    ];

    /** Twardy limit pozycji z aneksu kontraktu. */
    private const int LIMIT = 200;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->material(['lesson_id' => $lesson->id]);

        $this->getJson($this->url($lesson->id))
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated')
            ->assertJsonMissingPath('data');
    }

    public function test_only_project_manager_and_super_admin_may_read_the_list(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->material(['lesson_id' => $lesson->id]);

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

            $this->getJson($this->url($lesson->id))
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden')
                ->assertJsonMissingPath('data');
        }

        foreach (['project_manager', 'super_admin'] as $role) {
            $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

            $this->getJson($this->url($lesson->id))
                ->assertOk()
                ->assertJsonCount(1, 'data');
        }
    }

    public function test_a_role_outside_the_group_is_refused_before_anything_is_read(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $missing = $lesson->id + 1000;

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

            foreach ([$lesson->id, $missing] as $id) {
                DB::flushQueryLog();
                DB::enableQueryLog();

                $this->getJson($this->url($id))
                    ->assertStatus(403)
                    ->assertJsonPath('error.code', 'forbidden');

                $reads = $this->queriesTouching(['"lessons"', '"materials"']);
                DB::disableQueryLog();

                $this->assertSame([], $reads, "{$role} {$id}: odmowa musi paść przed odczytem lekcji i materiałów");
            }
        }
    }

    public function test_lesson_without_materials_returns_an_empty_list(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->actingAsAdmin();

        $this->getJson($this->url($lesson->id))
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_lesson_with_three_materials_returns_three_elements_with_exactly_the_resource_keys(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $ids = [
            $this->material(['lesson_id' => $lesson->id, 'name' => 'Karta pracy.pdf', 'created_at' => '2026-10-01 10:00:00']),
            $this->material(['lesson_id' => $lesson->id, 'name' => 'Slajdy.pdf', 'created_at' => '2026-10-01 10:01:00']),
            $this->material(['lesson_id' => $lesson->id, 'name' => 'Notatki.txt', 'mime' => 'text/plain', 'created_at' => '2026-10-01 10:02:00']),
        ];

        $this->actingAsAdmin();

        $response = $this->getJson($this->url($lesson->id))->assertOk();

        $response->assertJsonCount(3, 'data');
        $this->assertSame($ids, array_column($response->json('data'), 'id'));

        $resourceKeys = array_keys(AdminMaterialResource::make(Material::query()->findOrFail($ids[0]))->resolve(request()));
        sort($resourceKeys);
        $this->assertSame(self::ELEMENT_KEYS, $resourceKeys, 'zbiór kluczy zasobu zmienił się — ten aneks kontraktu też');

        foreach ($response->json('data') as $element) {
            $keys = array_keys($element);
            sort($keys);
            $this->assertSame(self::ELEMENT_KEYS, $keys);

            foreach (['download_url', 'file_path', 'path', 'disk', 'content', 'url'] as $forbidden) {
                $this->assertArrayNotHasKey($forbidden, $element);
            }
        }

        $first = $response->json('data.0');
        $this->assertSame($lesson->id, $first['lesson_id']);
        $this->assertNull($first['course_id']);
        $this->assertSame('Karta pracy.pdf', $first['name']);
        $this->assertSame('application/pdf', $first['mime']);
        $this->assertSame(1024, $first['size']);
    }

    public function test_materials_of_another_lesson_of_the_course_and_course_materials_are_not_listed(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course);
        $otherLesson = $this->lesson($course, 2);

        $own = $this->material(['lesson_id' => $lesson->id, 'name' => 'Własny']);
        $this->material(['lesson_id' => $otherLesson->id, 'name' => 'Innej lekcji']);
        $this->material(['course_id' => $course->id, 'name' => 'Całego kursu']);

        $this->actingAsAdmin();

        $response = $this->getJson($this->url($lesson->id))->assertOk();

        $this->assertSame([$own], array_column($response->json('data'), 'id'));
        $this->assertSame(['Własny'], array_column($response->json('data'), 'name'));
    }

    public function test_a_deleted_material_is_not_listed(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $kept = $this->material(['lesson_id' => $lesson->id, 'name' => 'Zostaje']);
        $removed = $this->material(['lesson_id' => $lesson->id, 'name' => 'Usunięty']);

        $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/materials/{$removed}")->assertOk();

        $this->assertSame(
            [$kept],
            array_column($this->getJson($this->url($lesson->id))->assertOk()->json('data'), 'id'),
        );
    }

    public function test_materials_come_oldest_first_and_ties_are_broken_by_id(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));

        // Wstawione w kolejności innej niż chronologiczna: kolejność wiersza w
        // tabeli nie może przypadkiem dać oczekiwanego wyniku.
        $latest = $this->material(['lesson_id' => $lesson->id, 'name' => 'Najnowszy', 'created_at' => '2026-10-01 12:00:00']);
        $oldest = $this->material(['lesson_id' => $lesson->id, 'name' => 'Najstarszy', 'created_at' => '2026-10-01 08:00:00']);
        // Remis znacznika czasu: wyższy identyfikator wstawiony PIERWSZY.
        $tieHigh = $this->material(['id' => 900002, 'lesson_id' => $lesson->id, 'name' => 'Remis b', 'created_at' => '2026-10-01 10:00:00']);
        $tieLow = $this->material(['id' => 900001, 'lesson_id' => $lesson->id, 'name' => 'Remis a', 'created_at' => '2026-10-01 10:00:00']);

        $this->actingAsAdmin();

        $ids = array_column($this->getJson($this->url($lesson->id))->assertOk()->json('data'), 'id');

        $this->assertSame([$oldest, $tieLow, $tieHigh, $latest], $ids);
    }

    public function test_a_lesson_with_201_materials_returns_200_and_the_limit_is_in_the_query(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->materialsInBulk($lesson->id, 201);

        $this->actingAsAdmin();

        DB::flushQueryLog();
        DB::enableQueryLog();

        $response = $this->getJson($this->url($lesson->id))->assertOk();

        $queries = array_map(
            static fn (array $query): string => strtolower($query['query']),
            DB::getQueryLog(),
        );
        DB::disableQueryLog();

        $this->assertCount(self::LIMIT, $response->json('data'));
        $this->assertSame('Materiał 001', $response->json('data.0.name'));
        $this->assertSame('Materiał 200', $response->json('data.'.(self::LIMIT - 1).'.name'));
        $this->assertNotContains('Materiał 201', array_column($response->json('data'), 'name'));

        $materialQueries = array_values(array_filter(
            $queries,
            static fn (string $sql): bool => str_contains($sql, 'from "materials"'),
        ));
        $this->assertCount(1, $materialQueries);
        $this->assertStringContainsString('limit 200', $materialQueries[0], 'ograniczenie ma być w zapytaniu do bazy, nie po wczytaniu');
    }

    public function test_unknown_soft_deleted_and_non_numeric_lessons_are_not_found(): void
    {
        $course = $this->course('etap-1');
        $deleted = $this->lesson($course);
        $this->material(['lesson_id' => $deleted->id]);
        $deleted->delete();

        $this->actingAsAdmin();

        $segments = [
            (string) ($deleted->id + 1000), // nieznana
            (string) $deleted->id, // usunięta miękko
            'abc', // nieliczbowy
            '99999999999999999999', // poza zakresem liczb całkowitych
        ];

        foreach ($segments as $segment) {
            $this->getJson("/api/v1/admin/lessons/{$segment}/materials")
                ->assertStatus(404)
                ->assertJsonPath('error.status', 404)
                ->assertJsonPath('error.code', 'not_found')
                ->assertJsonMissingPath('data');
        }
    }

    public function test_query_parameters_are_ignored(): void
    {
        $course = $this->course('etap-1');
        $lesson = $this->lesson($course);
        $otherLesson = $this->lesson($course, 2);
        $this->material(['lesson_id' => $lesson->id, 'name' => 'Pierwszy', 'created_at' => '2026-10-01 09:00:00']);
        $this->material(['lesson_id' => $lesson->id, 'name' => 'Drugi', 'created_at' => '2026-10-01 10:00:00']);
        $this->material(['lesson_id' => $otherLesson->id, 'name' => 'Cudzy']);

        $this->actingAsAdmin();

        $plain = $this->getJson($this->url($lesson->id))->assertOk();
        $withQuery = $this->getJson($this->url($lesson->id)."?page=2&per_page=1&lesson_id={$otherLesson->id}&sort=-id")->assertOk();

        $this->assertSame($plain->json(), $withQuery->json());
        $this->assertSame(['Pierwszy', 'Drugi'], array_column($withQuery->json('data'), 'name'));
        $this->assertArrayNotHasKey('meta', $withQuery->json());
    }

    public function test_a_read_writes_nothing_and_emits_no_audit_or_notification(): void
    {
        $lesson = $this->lesson($this->course('etap-1'));
        $this->materialsInBulk($lesson->id, 3);

        $this->actingAsAdmin();

        $before = $this->sideEffectCounts();

        DB::flushQueryLog();
        DB::enableQueryLog();

        $this->getJson($this->url($lesson->id))->assertOk()->assertJsonCount(3, 'data');

        $writes = array_values(array_filter(
            array_map(static fn (array $query): string => strtolower(ltrim($query['query'])), DB::getQueryLog()),
            static fn (string $sql): bool => (bool) preg_match('/^(insert|update|delete)\b/', $sql),
        ));
        DB::disableQueryLog();

        $this->assertSame([], $writes);
        $this->assertSame($before, $this->sideEffectCounts());
    }

    public function test_the_number_of_queries_does_not_depend_on_the_number_of_materials(): void
    {
        $course = $this->course('etap-1');
        $few = $this->lesson($course);
        $many = $this->lesson($course, 2);
        $this->materialsInBulk($few->id, 3);
        $this->materialsInBulk($many->id, 30);

        $this->actingAsAdmin();

        // Rozgrzewka: pierwsze żądanie może dołożyć jednorazowe zapytania.
        $this->getJson($this->url($few->id))->assertOk();

        $fewCount = $this->queryCountOf($few->id, 3);
        $manyCount = $this->queryCountOf($many->id, 30);

        $this->assertSame($fewCount, $manyCount, 'liczba zapytań rośnie z liczbą materiałów');
    }

    public function test_the_route_needs_a_token_and_is_not_on_the_public_list(): void
    {
        foreach (config('public_routes') as $pattern) {
            $this->assertFalse(
                Str::is($pattern, 'api/v1/admin/lessons/{lesson}/materials'),
                "wzorzec {$pattern} udostępniałby listę materiałów bez tokenu",
            );
        }

        $lesson = $this->lesson($this->course('etap-1'));

        $this->getJson($this->url($lesson->id))->assertStatus(401);
    }

    private function url(int|string $lessonId): string
    {
        return "/api/v1/admin/lessons/{$lessonId}/materials";
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

    private function lesson(Course $course, int $order = 1): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja '.$order,
            'sequence_order' => $order,
            'duration_seconds' => 1800,
        ]);
    }

    /**
     * Wiersz wprost w tabeli, bez pliku na dysku.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function material(array $attributes): int
    {
        $attributes += ['created_at' => '2026-10-01 10:00:00'];

        return DB::table('materials')->insertGetId($attributes + [
            'name' => 'Materiał',
            'file_path' => 'materials/etap-1/plik.pdf',
            'mime' => 'application/pdf',
            'size' => 1024,
            'updated_at' => $attributes['created_at'],
        ]);
    }

    /** `Materiał 001` … — rosnące znaczniki czasu co sekundę. */
    private function materialsInBulk(int $lessonId, int $count): void
    {
        $rows = [];

        for ($index = 1; $index <= $count; $index++) {
            $at = gmdate('Y-m-d H:i:s', strtotime('2026-10-01 10:00:00 UTC') + $index);
            $rows[] = [
                'lesson_id' => $lessonId,
                'name' => sprintf('Materiał %03d', $index),
                'file_path' => 'materials/etap-1/plik.pdf',
                'mime' => 'application/pdf',
                'size' => 1024,
                'created_at' => $at,
                'updated_at' => $at,
            ];
        }

        DB::table('materials')->insert($rows);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        return $admin;
    }

    /** @return array{audit: int, notifications: int, emails: int, materials: int} */
    private function sideEffectCounts(): array
    {
        return [
            'audit' => AuditLogEntry::count(),
            'notifications' => Notification::count(),
            'emails' => EmailMessage::count(),
            'materials' => Material::count(),
        ];
    }

    /**
     * @param  list<string>  $fragments
     * @return list<string>
     */
    private function queriesTouching(array $fragments): array
    {
        return array_values(array_filter(
            array_map(static fn (array $query): string => $query['query'], DB::getQueryLog()),
            static function (string $sql) use ($fragments): bool {
                foreach ($fragments as $fragment) {
                    if (str_contains($sql, $fragment)) {
                        return true;
                    }
                }

                return false;
            },
        ));
    }

    private function queryCountOf(int $lessonId, int $expectedElements): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $this->getJson($this->url($lessonId))->assertOk()->assertJsonCount($expectedElements, 'data');

        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }
}
