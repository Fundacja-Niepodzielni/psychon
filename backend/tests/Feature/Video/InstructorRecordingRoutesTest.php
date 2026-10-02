<?php

namespace Tests\Feature\Video;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Nagrania lekcji w kursie przypisanego prowadzącego:
 * `POST /instructor/lessons/{lesson}/video-uploads` i
 * `GET /instructor/lessons/{lesson}/video-status` (`routes/api/video.php`).
 *
 * Próby idą przez pełny stos tras z PRAWDZIWYM tokenem (rolę rozstrzyga token),
 * a dostawca nagrań jest atrapą `Http::fake` z zakazem żądań spoza atrapy.
 * Licznik `providerRequests()` liczy żądania do atrapy dostawcy nagrań — poza
 * sfałszowanym dostawcą tożsamości.
 *
 * Świadkowie: prowadzący przypisany do kursu dostaje 2xx tym samym kodem co
 * administracja; prowadzący bez przypisania, z przypisaniem tylko do lekcji
 * albo z przypisaniem zdjętym dostaje 404 identyczne z lekcją nieistniejącą —
 * także przy błędnym ciele i bez konfiguracji dostawcy; uczestnik i
 * administracja dostają na tych trasach 403; trasy administracji bez zmian.
 */
class InstructorRecordingRoutesTest extends TestCase
{
    use RefreshDatabase;

    private const string LIBRARY = 'test-library';

    private const string API_KEY = 'test-api-key';

    private const string GUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    private const string STORED_ID = 'stare-nagranie-1';

    private const string UPLOAD_ROUTE = 'api/v1/instructor/lessons/{lesson}/video-uploads';

    private const string STATUS_ROUTE = 'api/v1/instructor/lessons/{lesson}/video-status';

    private const array UPLOAD_DATA_KEYS = ['expiration_time', 'library_id', 'resumed', 'signature', 'upload_url', 'video_id'];

    private ?KeycloakTokenFactory $realm = null;

    /** @return array<string, array{string}> */
    public static function otherRoles(): array
    {
        return [
            'volunteer' => ['volunteer'],
            'student' => ['student'],
            'project_manager' => ['project_manager'],
            'super_admin' => ['super_admin'],
        ];
    }

    // --- przypisany prowadzący: 2xx ---------------------------------------

    public function test_an_assigned_instructor_gets_the_upload_permission_and_the_recording_is_on_its_way(): void
    {
        $this->configureBunny();
        $lesson = $this->lesson(self::STORED_ID);
        $this->bearerFor($this->assignedInstructor($lesson->course));
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);

        $response = $this->postJson("/api/v1/instructor/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated();

        $keys = array_keys($response->json('data'));
        sort($keys);
        $this->assertSame(self::UPLOAD_DATA_KEYS, $keys);
        $this->assertSame(self::GUID, $response->json('data.video_id'));
        $this->assertFalse($response->json('data.resumed'));
        $this->assertSame(
            hash('sha256', self::LIBRARY.self::API_KEY.$response->json('data.expiration_time').self::GUID),
            $response->json('data.signature'),
        );
        $this->assertStringNotContainsString(self::API_KEY, $response->getContent());

        // Ten sam zapis co u administracji: odtwarzane zostaje, nowe stoi „w drodze”.
        $fresh = $lesson->fresh();
        $this->assertSame(self::STORED_ID, $fresh->video_provider_id);
        $this->assertSame(self::GUID, $fresh->video_pending_id);
        $this->assertSame('uploading', $fresh->video_status);

        // Jedno żądanie — do atrapy dostawcy, nie do prawdziwego.
        $requests = $this->providerRequests();
        $this->assertCount(1, $requests);
        $this->assertSame('https://video.bunnycdn.com/library/'.self::LIBRARY.'/videos', $requests[0]->url());
    }

    public function test_an_assigned_instructor_resumes_an_upload_on_its_way_without_any_provider_request(): void
    {
        $this->configureBunny();
        $lesson = $this->lesson(null);
        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_pending_id' => self::GUID,
            'video_status' => 'uploading',
            'video_status_at' => now()->subMinutes(10),
        ]);
        $this->bearerFor($this->assignedInstructor($lesson->course));
        Http::fake(['*' => Http::response(['guid' => 'inny-identyfikator'])]);

        $this->postJson("/api/v1/instructor/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.resumed', true)
            ->assertJsonPath('data.video_id', self::GUID);

        $this->assertSame([], $this->providerRequests());
    }

    public function test_an_assigned_instructor_reads_the_recording_state_without_any_provider_request(): void
    {
        $this->configureBunny();
        $lesson = $this->lesson(self::STORED_ID);
        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_status' => 'ready',
            'video_status_at' => '2026-10-01 12:00:00',
        ]);
        $this->bearerFor($this->assignedInstructor($lesson->course));
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);

        $this->getJson("/api/v1/instructor/lessons/{$lesson->id}/video-status")
            ->assertOk()
            ->assertJsonPath('data.status', 'finished')
            ->assertJsonPath('data.video_status', 'ready')
            ->assertJsonPath('data.video_status_at', '2026-10-01T12:00:00Z')
            ->assertJsonPath('data.video_ready', true)
            ->assertJsonPath('data.video_pending', false)
            ->assertJsonPath('data.duration_seconds', 600);

        $this->assertSame([], $this->providerRequests());
    }

    public function test_the_instructor_status_is_the_same_response_as_the_administration_status(): void
    {
        $this->configureBunny();
        $lesson = $this->lesson(null);
        $this->bearerFor($this->assignedInstructor($lesson->course));
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);

        $instructor = $this->getJson("/api/v1/instructor/lessons/{$lesson->id}/video-status")->assertOk()->json();

        $this->bearerFor($this->user('project_manager'), 'project_manager');
        $admin = $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")->assertOk()->json();

        $this->assertSame($admin, $instructor);
        $this->assertSame('no_video', $instructor['data']['status']);
        $this->assertSame([], $this->providerRequests());
    }

    /**
     * Na własnej lekcji odmowy treści są te same co u administracji — to ten sam
     * kod. Każda odmowa: zero żądań do dostawcy, lekcja bez zmian.
     */
    public function test_on_an_own_lesson_the_body_refusals_and_the_missing_configuration_are_the_administration_ones(): void
    {
        $this->configureBunny();
        $lesson = $this->lesson(self::STORED_ID);
        $this->bearerFor($this->assignedInstructor($lesson->course));
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $url = "/api/v1/instructor/lessons/{$lesson->id}/video-uploads";

        $this->postJson($url, [])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->postJson($url, ['title' => 'Nagranie', 'video_id' => 'podstawiony'])
            ->assertStatus(422)->assertJsonPath('error.code', 'invalid_payload');
        $this->postJson($url, ['title' => str_repeat('a', 9000)])
            ->assertStatus(413)->assertJsonPath('error.code', 'payload_too_large');
        $this->post($url, ['title' => 'Nagranie', 'file' => UploadedFile::fake()->create('n.mp4', 16, 'video/mp4')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('error.code', 'no_direct_upload');

        $this->unconfigureBunny();
        $this->postJson($url, ['title' => 'Nagranie'])->assertStatus(503)->assertJsonPath('error.code', 'video_not_configured');
        $this->getJson("/api/v1/instructor/lessons/{$lesson->id}/video-status")
            ->assertStatus(503)->assertJsonPath('error.code', 'video_not_configured');

        $this->assertSame([], $this->providerRequests());
        $this->assertUntouched($lesson);
    }

    // --- prowadzący bez przypisania: 404 jak lekcja nieistniejąca -----------

    /**
     * Cztery rodzaje „obcej” lekcji wobec jednej nieistniejącej, na obu trasach,
     * z poprawnym ciałem, pustym ciałem, nieznanym polem, ciałem ponad limit,
     * multipartem z plikiem i bez konfiguracji dostawcy: zawsze 404 i całe ciało
     * odpowiedzi równe odpowiedzi dla lekcji nieistniejącej.
     */
    public function test_a_foreign_lesson_looks_exactly_like_a_missing_one_whatever_the_body_and_the_configuration(): void
    {
        $this->configureBunny();
        $own = $this->lesson(null);
        $instructor = $this->assignedInstructor($own->course);
        $this->bearerFor($instructor);
        Http::fake(['*' => Http::response(['guid' => self::GUID, 'status' => 4, 'length' => 125])]);

        $unassigned = $this->lesson(self::STORED_ID.'-a');
        $lessonOnly = $this->lesson(self::STORED_ID.'-b');
        CourseAssignment::create(['course_id' => $lessonOnly->course_id, 'lesson_id' => $lessonOnly->id, 'instructor_id' => $instructor->id, 'assigned_at' => now()]);
        $withdrawn = $this->lesson(self::STORED_ID.'-c');
        CourseAssignment::create(['course_id' => $withdrawn->course_id, 'lesson_id' => null, 'instructor_id' => $instructor->id, 'assigned_at' => now()->subDay(), 'unassigned_at' => now()]);
        $deleted = $this->lesson(self::STORED_ID.'-d');
        $this->assign($deleted->course, $instructor);
        $deleted->delete();
        $deletedCourse = $this->lesson(self::STORED_ID.'-e');
        $this->assign($deletedCourse->course, $instructor);
        $deletedCourse->course->delete();

        $foreign = [
            'kurs bez przypisania' => $unassigned->id,
            'przypisanie tylko do lekcji' => $lessonOnly->id,
            'przypisanie zdjęte' => $withdrawn->id,
            'lekcja usunięta' => $deleted->id,
            'kurs usunięty' => $deletedCourse->id,
        ];
        $missing = (int) Lesson::withTrashed()->max('id') + 1000;

        foreach ([true, false] as $configured) {
            $configured ? $this->configureBunny() : $this->unconfigureBunny();

            foreach ($this->requestVariants() as $variant => $send) {
                $expected = $send($missing);
                $this->assertSame(404, $expected->status(), "{$variant}: lekcja nieistniejąca");
                $this->assertSame('not_found', $expected->json('error.code'));
                $this->assertSame('Nie znaleziono zasobu.', $expected->json('error.message'));

                foreach ($foreign as $label => $id) {
                    $actual = $send($id);
                    $this->assertSame(404, $actual->status(), "{$variant}: {$label}");
                    $this->assertSame($expected->json(), $actual->json(), "{$variant}: {$label}");
                }
            }
        }

        $this->assertSame([], $this->providerRequests());
        foreach ([$unassigned, $lessonOnly, $withdrawn] as $lesson) {
            $this->assertUntouched($lesson);
        }
        $this->assertSame(self::STORED_ID.'-d', Lesson::withTrashed()->findOrFail($deleted->id)->video_provider_id);
    }

    public function test_a_lesson_id_beyond_the_integer_range_is_a_plain_404(): void
    {
        $this->configureBunny();
        $this->bearerFor($this->assignedInstructor($this->lesson(null)->course));
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);

        $this->postJson('/api/v1/instructor/lessons/99999999999999999999/video-uploads', ['title' => 'Nagranie'])
            ->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->getJson('/api/v1/instructor/lessons/99999999999999999999/video-status')
            ->assertStatus(404)->assertJsonPath('error.code', 'not_found');

        $this->assertSame([], $this->providerRequests());
    }

    // --- inne role: 403 ---------------------------------------------------

    #[DataProvider('otherRoles')]
    public function test_any_other_role_gets_the_same_403_for_an_existing_and_a_missing_lesson(string $role): void
    {
        $this->configureBunny();
        $lesson = $this->lesson(self::STORED_ID);
        $this->bearerFor($this->user($role), $role);
        Http::fake(['*' => Http::response(['guid' => self::GUID, 'status' => 4, 'length' => 125])]);
        $missing = (int) Lesson::withTrashed()->max('id') + 1000;

        foreach ($this->requestVariants() as $variant => $send) {
            $existing = $send($lesson->id);
            $this->assertSame(403, $existing->status(), "{$role} {$variant}");
            $this->assertSame('forbidden', $existing->json('error.code'));
            $this->assertSame($existing->json(), $send($missing)->json(), "{$role} {$variant}");
        }

        $this->assertSame([], $this->providerRequests());
        $this->assertUntouched($lesson);
    }

    public function test_without_a_token_both_routes_answer_401_and_nothing_is_sent(): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->postJson("/api/v1/instructor/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
        $this->getJson("/api/v1/instructor/lessons/{$lesson->id}/video-status")
            ->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');

        $this->assertSame([], $this->providerRequests());
        $this->assertUntouched($lesson);
    }

    // --- rejestr tras -----------------------------------------------------

    public function test_both_instructor_routes_sit_behind_exactly_the_instructor_role(): void
    {
        $this->assertSame(['instructor'], $this->rolesGuardingRoute('POST', self::UPLOAD_ROUTE));
        $this->assertSame(['instructor'], $this->rolesGuardingRoute('GET', self::STATUS_ROUTE));
    }

    public function test_the_administration_routes_keep_their_role_gate(): void
    {
        $this->assertSame(['project_manager', 'super_admin'], $this->rolesGuardingRoute('POST', 'api/v1/admin/lessons/{lesson}/video-uploads'));
        $this->assertSame(['project_manager', 'super_admin'], $this->rolesGuardingRoute('GET', 'api/v1/admin/lessons/{lesson}/video-status'));
    }

    // --- pomocnicze -------------------------------------------------------

    /**
     * Każde żądanie przechodzi przez strażnika `keycloak` od nowa: bez tego
     * drugie żądanie w jednej próbie dostaje osobę zapamiętaną przez strażnika,
     * ale bez ról z tokena.
     *
     * @param  array<mixed>  $parameters
     * @param  array<mixed>  $cookies
     * @param  array<mixed>  $files
     * @param  array<mixed>  $server
     */
    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $this->app['auth']->forgetGuards();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    /**
     * Każdy wariant żądania na trasach prowadzącego, dla danego identyfikatora lekcji.
     *
     * @return array<string, callable(int): TestResponse>
     */
    private function requestVariants(): array
    {
        $upload = fn (int $id): string => "/api/v1/instructor/lessons/{$id}/video-uploads";

        return [
            'POST poprawne ciało' => fn (int $id) => $this->postJson($upload($id), ['title' => 'Nagranie']),
            'POST puste ciało' => fn (int $id) => $this->postJson($upload($id), []),
            'POST nieznane pole' => fn (int $id) => $this->postJson($upload($id), ['title' => 'Nagranie', 'video_id' => 'podstawiony']),
            'POST ciało ponad limit' => fn (int $id) => $this->postJson($upload($id), ['title' => str_repeat('a', 9000)]),
            'POST multipart z plikiem' => fn (int $id) => $this->post(
                $upload($id),
                ['title' => 'Nagranie', 'file' => UploadedFile::fake()->create('n.mp4', 16, 'video/mp4')],
                ['Accept' => 'application/json'],
            ),
            'GET stan' => fn (int $id) => $this->getJson("/api/v1/instructor/lessons/{$id}/video-status"),
        ];
    }

    private function assertUntouched(Lesson $lesson): void
    {
        $fresh = $lesson->fresh();
        $this->assertSame($lesson->video_provider_id, $fresh->video_provider_id);
        $this->assertNull($fresh->video_pending_id);
        $this->assertNull($fresh->video_status);
    }

    /**
     * @return list<string>
     */
    private function rolesGuardingRoute(string $method, string $uri): array
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RoutingRoute $route): bool => $route->uri() === $uri && in_array($method, $route->methods(), true));

        $this->assertCount(1, $routes, "Oczekiwano dokładnie jednej trasy {$method} {$uri}.");

        $gates = collect($routes->first()->gatherMiddleware())
            ->filter(fn ($middleware): bool => is_string($middleware) && str_starts_with($middleware, 'role:'))
            ->values();

        $this->assertCount(1, $gates, "Trasa {$method} {$uri} ma mieć dokładnie jednego pośrednika roli.");

        $roles = explode(',', substr((string) $gates->first(), strlen('role:')));
        sort($roles);

        return $roles;
    }

    /**
     * Żądania wysłane gdziekolwiek poza sfałszowanym dostawcą tożsamości,
     * czyli do atrapy dostawcy nagrań.
     *
     * @return list<Request>
     */
    private function providerRequests(): array
    {
        return Http::recorded(
            fn (Request $request): bool => ! str_starts_with($request->url(), KeycloakTokenFactory::ISSUER),
        )
            ->map(fn (array $pair): Request => $pair[0])
            ->values()
            ->all();
    }

    /**
     * Ustawia nagłówek z prawdziwym tokenem, który niesie daną rolę (rolę
     * rozstrzyga token, nie `users.role`). Kolejne wywołanie podmienia osobę.
     */
    private function bearerFor(User $user, string $role = 'instructor'): void
    {
        if ($this->realm === null) {
            $this->realm = (new KeycloakTokenFactory)->installAsRealm();
            Http::preventStrayRequests();
        }

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$this->realm->mint([
            'sub' => $user->keycloak_sub,
            'realm_access' => ['roles' => [config("keycloak.roles.{$role}")]],
        ]));
    }

    private function user(string $role): User
    {
        return User::factory()->role($role)->create(['keycloak_sub' => (string) Str::uuid()]);
    }

    private function assignedInstructor(Course $course): User
    {
        $instructor = $this->user('instructor');
        $this->assign($course, $instructor);

        return $instructor;
    }

    private function assign(Course $course, User $instructor): void
    {
        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
    }

    private function configureBunny(): void
    {
        Config::set('services.bunny.api_key', self::API_KEY);
        Config::set('services.bunny.library_id', self::LIBRARY);
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
    }

    private function unconfigureBunny(): void
    {
        Config::set('services.bunny.api_key', '');
        Config::set('services.bunny.library_id', '');
        Config::set('services.bunny.cdn_hostname', '');
        Config::set('services.bunny.token_security_key', '');
    }

    /**
     * Lekcja w osobnym, szkicowym kursie tej samej grupy produktowej co każda
     * osoba z fabryki — grupa produktowa nie wiąże prowadzącego z kursem na tych
     * trasach, wiąże wyłącznie przypisanie.
     */
    private function lesson(?string $videoId): Lesson
    {
        $course = Course::create([
            'title' => 'Kurs z nagraniem '.uniqid(),
            'slug' => 'kurs-z-nagraniem-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->edition()->id,
            'is_published' => false,
        ]);

        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja z nagraniem',
            'sequence_order' => 1,
            'duration_seconds' => 600,
            'video_provider_id' => $videoId,
        ]);
    }

    private function edition(): Edition
    {
        return Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja z nagraniem',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
    }
}
