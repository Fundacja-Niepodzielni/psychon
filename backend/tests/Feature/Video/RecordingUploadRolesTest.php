<?php

namespace Tests\Feature\Video;

use App\Models\Course;
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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Kto może zlecić wgranie nagrania lekcji (`POST /admin/lessons/{id}/video-uploads`)
 * i kto może odczytać stan przetwarzania (`GET /admin/lessons/{id}/video-status`).
 *
 * Próg roli obu tras to `role:project_manager,super_admin`. Próby idą przez
 * pełny stos tras z PRAWDZIWYM tokenem (`KeycloakTokenFactory`), a nie przez
 * `actingAs`: dzięki temu rolę rozstrzyga token, a konto zablokowane faktycznie
 * przechodzi przez strażnika `keycloak` (przy `actingAs` strażnik się nie
 * uruchamia i zablokowane konto nie zostałoby w ogóle sprawdzone).
 *
 * Żadne żądanie nie opuszcza procesu: `Http::fake` łapie wszystko, a asercje
 * liczą żądania wysłane gdziekolwiek poza (sfałszowanym) dostawcą tożsamości —
 * czyli do dostawcy nagrań.
 */
class RecordingUploadRolesTest extends TestCase
{
    use RefreshDatabase;

    private const string LIBRARY = 'test-library';

    private const string API_KEY = 'test-api-key';

    private const string GUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    private const string OTHER_GUID = '9b2c5d1e-0a47-4f3b-8c6d-1e2f3a4b5c6d';

    private const string STORED_ID = 'stare-nagranie-1';

    private const string UPLOAD_ROUTE = 'api/v1/admin/lessons/{lesson}/video-uploads';

    private const string STATUS_ROUTE = 'api/v1/admin/lessons/{lesson}/video-status';

    /**
     * Wiek tokena w chwili wybicia. Walidator odrzuca token, którego `iat` jest
     * późniejsze niż `time()` (luz 0), a zegar ścienny hosta bramki (WSL) cofa się
     * co ~30 s o kilkanaście milisekund (zmierzone). Krok wstecz między wybiciem a
     * sprawdzeniem, który przetnie granicę sekundy, dawał 401 w przypadku, który
     * akurat na niego trafił — niezależnie od roli. Token wydany minutę wcześniej
     * nie zależy od kroku zegara, a jego `exp` zostaje taki, jaki nadaje fabryka.
     */
    private const int TOKEN_AGE_SECONDS = 60;

    /** Dokładnie te klucze niesie dziś odpowiedź wgrania — u obu ról. */
    private const array UPLOAD_DATA_KEYS = ['expiration_time', 'library_id', 'resumed', 'signature', 'upload_url', 'video_id'];

    /** @return array<string, array{string}> */
    public static function administrationRoles(): array
    {
        return [
            'project_manager' => ['project_manager'],
            'super_admin' => ['super_admin'],
        ];
    }

    /** @return array<string, array{string}> */
    public static function foreignRoles(): array
    {
        return [
            'instructor' => ['instructor'],
            'volunteer' => ['volunteer'],
            'student' => ['student'],
        ];
    }

    /** @return array<string, array{string}> */
    public static function allRoles(): array
    {
        return self::administrationRoles() + self::foreignRoles();
    }

    // --- sukces -----------------------------------------------------------

    #[DataProvider('administrationRoles')]
    public function test_an_administration_role_gets_the_upload_permission_and_the_recording_is_on_its_way(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(null);

        $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated();

        $this->assertSame(self::GUID, $response->json('data.video_id'));
        $this->assertFalse($response->json('data.resumed'));
        // Wysyłka nie rusza nagrania odtwarzanego: nowe nagranie stoi „w drodze”.
        $fresh = $lesson->fresh();
        $this->assertNull($fresh->video_provider_id);
        $this->assertSame(self::GUID, $fresh->video_pending_id);
        $this->assertSame('uploading', $fresh->video_status);
        $this->assertSame(
            hash('sha256', self::LIBRARY.self::API_KEY.$response->json('data.expiration_time').self::GUID),
            $response->json('data.signature'),
        );
        $this->assertStringNotContainsString(self::API_KEY, $response->getContent());

        $requests = $this->providerRequests();
        $this->assertCount(1, $requests);
        $this->assertSame('POST', $requests[0]->method());
        $this->assertSame('https://video.bunnycdn.com/library/'.self::LIBRARY.'/videos', $requests[0]->url());
    }

    #[DataProvider('administrationRoles')]
    public function test_an_administration_role_resumes_an_upload_on_its_way_without_asking_the_provider(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => 'inny-identyfikator'])]);
        $lesson = $this->lesson(null);
        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_pending_id' => self::GUID,
            'video_status' => 'uploading',
            'video_status_at' => now()->subMinutes(10),
        ]);

        $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated();

        $this->assertTrue($response->json('data.resumed'));
        $this->assertSame(self::GUID, $response->json('data.video_id'));
        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::GUID, $lesson->fresh()->video_pending_id);
    }

    public function test_both_administration_roles_get_the_same_status_and_the_same_response_keys(): void
    {
        $this->configureBunny();
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        // Dostawca wydaje każdej lekcji inny identyfikator: ten sam identyfikator dla
        // dwóch lekcji byłby odrzucony (`502`), bo jedno nagranie nie trafia do dwóch lekcji.
        // Zakolejkowane identyfikatory dostaje wyłącznie wołanie tworzące nagranie u
        // dostawcy; inne żądania wychodzące (np. po klucze tożsamości) odpowiadają jak
        // dotąd, żeby nie zjadały kolejki.
        $guids = [self::GUID, self::OTHER_GUID];
        Http::fake(function ($request) use (&$guids) {
            $isCreate = str_contains($request->url(), 'video.bunnycdn.com');

            return Http::response(['guid' => $isCreate ? array_shift($guids) : self::GUID]);
        });
        $shapes = [];

        foreach (['project_manager', 'super_admin'] as $role) {
            $this->app['auth']->forgetGuards();
            $this->withHeader('Authorization', 'Bearer '.$this->tokenFor($realm, $role));
            $lesson = $this->lesson(null);

            $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie']);

            $this->assertSame(201, $response->getStatusCode(), "Rola {$role} powinna dostać 201.");
            $json = $response->json();
            $dataKeys = array_keys($json['data']);
            sort($dataKeys);
            $topKeys = array_keys($json);
            sort($topKeys);
            $shapes[$role] = ['status' => $response->getStatusCode(), 'top' => $topKeys, 'data' => $dataKeys];
        }

        $this->assertSame($shapes['super_admin'], $shapes['project_manager']);
        $this->assertSame(['data'], $shapes['project_manager']['top']);
        $this->assertSame(self::UPLOAD_DATA_KEYS, $shapes['project_manager']['data']);
        $this->assertCount(2, $this->providerRequests());
    }

    // --- odmowa roli ------------------------------------------------------

    #[DataProvider('foreignRoles')]
    public function test_a_foreign_role_is_refused_before_any_request_to_the_provider_and_the_lesson_is_untouched(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(403)
            ->assertJsonPath('error.status', 403)
            ->assertJsonPath('error.code', 'forbidden')
            ->assertJsonStructure(['error' => ['status', 'code', 'message']])
            ->assertJsonMissingPath('data');

        $this->assertSame([], $this->providerRequests());
        $fresh = $lesson->fresh();
        $this->assertSame(self::STORED_ID, $fresh->video_provider_id);
        $this->assertNull($fresh->video_pending_id);
        $this->assertNull($fresh->video_status);
    }

    #[DataProvider('foreignRoles')]
    public function test_a_foreign_role_gets_403_and_not_the_missing_configuration_error(string $role): void
    {
        $this->bearerAs($role);
        $this->unconfigureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(null);

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame([], $this->providerRequests());
        $this->assertNull($lesson->fresh()->video_provider_id);
    }

    // Dwa przypadki roli obcej, każdy przypięty do jednego kodu. O wyniku rozstrzyga
    // kolejność pośredników trasy: uwierzytelnienie, potem wiązanie parametrów trasy
    // (`SubstituteBindings`, tu wyszukanie lekcji z adresu), dopiero potem próg roli.
    // Lekcja istnieje → wiązanie przechodzi i próg roli odmawia: 403 (próba wyżej).
    // Lekcji nie ma → wiązanie kończy żądanie wcześniej: 404, a próg roli nie jest
    // nawet sprawdzany. To zachowanie wspólne wszystkich tras administracji z lekcją
    // w adresie; zmiana kolejności pośredników zmieni ten kod i ta próba ma to pokazać.
    #[DataProvider('foreignRoles')]
    public function test_a_foreign_role_asking_about_an_unknown_lesson_gets_404_because_binding_runs_before_the_role_check(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);

        $this->postJson('/api/v1/admin/lessons/999999/video-uploads', ['title' => 'Nagranie'])
            ->assertStatus(404)
            ->assertJsonPath('error.status', 404)
            ->assertJsonPath('error.code', 'not_found')
            ->assertJsonMissingPath('data');

        $this->assertSame([], $this->providerRequests());
    }

    public function test_a_request_without_a_token_gets_401_and_nothing_is_sent_to_the_provider(): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(401)
            ->assertJsonPath('error.status', 401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    /**
     * Konto zablokowane nie dociera do progu roli: strażnik `keycloak` odrzuca je
     * jako niezalogowane (401), zanim `role` zapyta o cokolwiek. Obie role
     * administracji muszą zachować się tak samo.
     */
    #[DataProvider('administrationRoles')]
    public function test_a_blocked_account_of_an_administration_role_is_refused_with_401_and_nothing_is_sent(string $role): void
    {
        $this->bearerAs($role, ['status' => 'blocked']);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    // --- lekcja -----------------------------------------------------------

    #[DataProvider('administrationRoles')]
    public function test_an_unknown_lesson_gets_404_and_nothing_is_sent(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);

        $this->postJson('/api/v1/admin/lessons/999999/video-uploads', ['title' => 'Nagranie'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame([], $this->providerRequests());
    }

    #[DataProvider('administrationRoles')]
    public function test_a_soft_deleted_lesson_gets_404_and_nothing_is_sent(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);
        $lesson->delete();

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::STORED_ID, Lesson::withTrashed()->findOrFail($lesson->id)->video_provider_id);
    }

    // --- odmowy treści: te same u obu ról ----------------------------------

    #[DataProvider('administrationRoles')]
    public function test_a_multipart_request_with_a_file_is_refused_the_same_way(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->post(
            "/api/v1/admin/lessons/{$lesson->id}/video-uploads",
            ['title' => 'Nagranie', 'file' => UploadedFile::fake()->create('nagranie.mp4', 16, 'video/mp4')],
            ['Accept' => 'application/json'],
        )
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'no_direct_upload');

        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    #[DataProvider('administrationRoles')]
    public function test_a_body_over_the_limit_is_refused_the_same_way(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => str_repeat('a', 9000)])
            ->assertStatus(413)
            ->assertJsonPath('error.code', 'payload_too_large');

        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    #[DataProvider('administrationRoles')]
    public function test_an_unknown_field_is_refused_the_same_way(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(self::STORED_ID);

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", [
            'title' => 'Nagranie',
            'video_id' => 'podstawiony-identyfikator',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_payload');

        $this->assertSame([], $this->providerRequests());
        $this->assertSame(self::STORED_ID, $lesson->fresh()->video_provider_id);
    }

    // --- odczyt stanu: bez zmiany -----------------------------------------

    #[DataProvider('administrationRoles')]
    public function test_the_status_route_answers_both_administration_roles(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
        $lesson = $this->lesson('mock-etap-1-3');

        $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")
            ->assertOk()
            ->assertJsonPath('data.status', 'finished')
            ->assertJsonPath('data.duration_seconds', 125);

        $this->assertCount(1, $this->providerRequests());
    }

    #[DataProvider('foreignRoles')]
    public function test_the_status_route_refuses_a_foreign_role_and_sends_nothing(string $role): void
    {
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
        $lesson = $this->lesson('mock-etap-1-3');

        $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame([], $this->providerRequests());
    }

    public function test_the_status_route_without_a_token_gets_401(): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
        $lesson = $this->lesson('mock-etap-1-3');

        $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertSame([], $this->providerRequests());
    }

    // --- strażnik progu ---------------------------------------------------

    /**
     * Próg roli odczytany z rejestru tras. Czerwienieje przy zawężeniu do samego
     * `super_admin` i przy poszerzeniu o dowolną inną rolę, a także gdy trasa
     * straci pośrednika roli albo dostanie drugiego.
     */
    public function test_the_upload_route_sits_behind_exactly_the_two_administration_roles(): void
    {
        $this->assertSame(['project_manager', 'super_admin'], $this->rolesGuardingRoute('POST', self::UPLOAD_ROUTE));
    }

    public function test_the_status_route_sits_behind_the_same_two_roles(): void
    {
        $this->assertSame(['project_manager', 'super_admin'], $this->rolesGuardingRoute('GET', self::STATUS_ROUTE));
    }

    /**
     * Każda rola poza administracją dostaje odmowę, a obie role administracji
     * przechodzą próg — ten sam podział, który wynika z rejestru tras.
     */
    #[DataProvider('allRoles')]
    public function test_the_route_registry_and_the_behaviour_agree_on_who_passes(string $role): void
    {
        $roles = $this->rolesGuardingRoute('POST', self::UPLOAD_ROUTE);
        $this->bearerAs($role);
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => self::GUID])]);
        $lesson = $this->lesson(null);

        $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie']);

        $this->assertSame(in_array($role, $roles, true) ? 201 : 403, $response->getStatusCode());
    }

    // --- pomocnicze -------------------------------------------------------

    /**
     * Role z jedynego pośrednika `role:` trasy, posortowane; zero albo dwóch
     * pośredników roli to osobna czerwień.
     *
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
     * czyli do dostawcy nagrań.
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
     * Zakłada konto danej roli i ustawia nagłówek z prawdziwym tokenem, który tę
     * rolę niesie (rolę rozstrzyga token, nie `users.role`).
     *
     * @param  array<string, mixed>  $attributes
     */
    private function bearerAs(string $role, array $attributes = []): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();

        $this->withHeader('Authorization', 'Bearer '.$this->tokenFor($realm, $role, $attributes));
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function tokenFor(KeycloakTokenFactory $realm, string $role, array $attributes = []): string
    {
        $sub = (string) Str::uuid();
        User::factory()->role($role)->create(['keycloak_sub' => $sub, ...$attributes]);

        return $realm->mint([
            'sub' => $sub,
            'realm_access' => ['roles' => [config("keycloak.roles.{$role}")]],
            'iat' => time() - self::TOKEN_AGE_SECONDS,
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

    private function lesson(?string $videoId): Lesson
    {
        $course = Course::create([
            'title' => 'Kurs z nagraniem '.uniqid(),
            'slug' => 'kurs-z-nagraniem-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
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
