<?php

namespace Tests\Feature\Video;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Limit żądań na zleceniu wgrania nagrania lekcji: 10 na minutę na osobę, na
 * OBU trasach (`/instructor/lessons/{lesson}/video-uploads` i
 * `/admin/lessons/{lesson}/video-uploads`), jedna definicja limitu.
 *
 * Zlecenie wgrania jest jedyną trasą nagrań, która kosztuje żądanie do dostawcy
 * (utworzenie wideo), więc tylko ona ma limit; odczyt stanu go nie ma.
 *
 * Kolejność jak na trasie zapisu wzoru dokumentu (pomiar: wolontariusz dostaje na niej
 * 403 dwadzieścia razy, dwudzieste pierwsze żądanie dostaje 429): brak tokenu (401)
 * stoi przed limitem i go nie zużywa; odmowa roli (403) i odmowa zasięgu (404 w
 * kontrolerze) stoją PO limicie i liczą się do niego. Żądanie odrzucone limitem nie wysyła niczego
 * do dostawcy: dostawca jest atrapą `Http::fake`, a licznik liczy żądania do niej
 * (poza sfałszowanym dostawcą tożsamości).
 */
class RecordingUploadRateLimitTest extends TestCase
{
    use RefreshDatabase;

    private const int LIMIT = 10;

    private ?KeycloakTokenFactory $realm = null;

    private int $order = 0;

    /** @return array<string, array{string, string}> rola z tokena i przedrostek trasy */
    public static function uploaders(): array
    {
        return [
            'prowadzacy' => ['instructor', 'instructor'],
            'opiekun projektu' => ['project_manager', 'admin'],
            'super admin' => ['super_admin', 'admin'],
        ];
    }

    #[DataProvider('uploaders')]
    public function test_the_eleventh_request_in_a_minute_is_refused_with_the_shared_throttle_envelope(string $role, string $prefix): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $person = $this->uploader($role);
        $this->bearerFor($person, $role);

        for ($n = 1; $n <= self::LIMIT; $n++) {
            $this->upload($this->url($prefix, $this->lessonFor($role, $person)), ['title' => 'Nagranie '.$n])
                ->assertCreated();
        }
        $this->assertCount(self::LIMIT, $this->providerRequests());

        $response = $this->upload($this->url($prefix, $this->lessonFor($role, $person)), ['title' => 'Nagranie 11'])
            ->assertStatus(429)
            ->assertJsonPath('error.status', 429)
            ->assertJsonPath('error.code', 'too_many_requests')
            ->assertJsonPath('error.message', 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.');

        $retry = $response->json('error.reason.retry_after_seconds');
        $this->assertIsInt($retry);
        $this->assertGreaterThanOrEqual(1, $retry);
        $this->assertLessThanOrEqual(60, $retry);
        $this->assertSame(['retry_after_seconds'], array_keys($response->json('error.reason')));
    }

    #[DataProvider('uploaders')]
    public function test_a_request_refused_by_the_limit_sends_nothing_to_the_provider_and_changes_no_lesson(string $role, string $prefix): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $person = $this->uploader($role);
        $this->bearerFor($person, $role);

        for ($n = 1; $n <= self::LIMIT; $n++) {
            $this->upload($this->url($prefix, $this->lessonFor($role, $person)), ['title' => 'Nagranie'])->assertCreated();
        }
        $before = count($this->providerRequests());
        $this->assertSame(self::LIMIT, $before);

        $lesson = $this->lessonFor($role, $person);
        $this->upload($this->url($prefix, $lesson), ['title' => 'Nagranie'])->assertStatus(429);
        // Także poprawne i błędne ciało dostaje to samo: limit stoi przed treścią.
        $this->upload($this->url($prefix, $lesson), [])->assertStatus(429);

        $this->assertCount($before, $this->providerRequests());
        $fresh = $lesson->fresh();
        $this->assertNull($fresh->video_pending_id);
        $this->assertNull($fresh->video_status);
    }

    #[DataProvider('uploaders')]
    public function test_the_limit_counts_per_person_and_a_second_person_is_not_blocked(string $role, string $prefix): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $first = $this->uploader($role);
        $second = $this->uploader($role);

        $this->bearerFor($first, $role);
        for ($n = 1; $n <= self::LIMIT; $n++) {
            $this->upload($this->url($prefix, $this->lessonFor($role, $first)), ['title' => 'Nagranie'])->assertCreated();
        }
        $this->upload($this->url($prefix, $this->lessonFor($role, $first)), ['title' => 'Nagranie'])->assertStatus(429);

        $this->bearerFor($second, $role);
        $this->upload($this->url($prefix, $this->lessonFor($role, $second)), ['title' => 'Nagranie'])->assertCreated();

        $this->bearerFor($first, $role);
        $this->upload($this->url($prefix, $this->lessonFor($role, $first)), ['title' => 'Nagranie'])->assertStatus(429);
    }

    public function test_both_upload_routes_share_one_limit_definition_and_the_status_routes_have_none(): void
    {
        $limits = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();
            if (! str_ends_with($uri, '/video-uploads') && ! str_ends_with($uri, '/video-status')) {
                continue;
            }
            $throttle = array_values(array_filter(
                $route->gatherMiddleware(),
                static fn ($middleware): bool => is_string($middleware) && str_starts_with($middleware, 'throttle:'),
            ));
            $limits[$uri] = $throttle;
        }

        ksort($limits);
        $this->assertCount(4, $limits);
        $uploads = array_filter($limits, static fn (string $uri): bool => str_ends_with($uri, '/video-uploads'), ARRAY_FILTER_USE_KEY);
        $statuses = array_filter($limits, static fn (string $uri): bool => str_ends_with($uri, '/video-status'), ARRAY_FILTER_USE_KEY);

        $this->assertCount(2, $uploads);
        foreach ($uploads as $uri => $throttle) {
            $this->assertCount(1, $throttle, "Trasa {$uri} ma dokładnie jeden limit.");
        }
        $this->assertCount(1, array_unique(array_map(static fn (array $throttle): string => $throttle[0], $uploads)));
        foreach ($statuses as $uri => $throttle) {
            $this->assertSame([], $throttle, "Odczyt stanu {$uri} nie ma limitu.");
        }
    }

    public function test_the_status_read_is_not_limited(): void
    {
        $this->configureBunny();
        $this->fakeProvider(['status' => 4, 'length' => 125]);
        $instructor = $this->uploader('instructor');
        $lesson = $this->lessonFor('instructor', $instructor);
        $this->bearerFor($instructor, 'instructor');

        for ($n = 1; $n <= self::LIMIT + 5; $n++) {
            $this->readStatus("/api/v1/instructor/lessons/{$lesson->id}/video-status")->assertOk();
        }
    }

    // --- kolejność: token przed limitem, rola i zasięg po limicie --------------

    #[DataProvider('refusedRoles')]
    public function test_a_role_refusal_stands_after_the_limit_and_counts_towards_it(string $role, string $prefix): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $this->bearerFor($this->user($role), $role);
        $lesson = $this->lessonFor('project_manager', $this->user('project_manager'));

        for ($n = 1; $n <= self::LIMIT; $n++) {
            $this->upload($this->url($prefix, $lesson), ['title' => 'Nagranie'])
                ->assertForbidden()
                ->assertJsonPath('error.code', 'forbidden');
        }

        // Jedenasta odmowa jest już odmową limitu — rola nie dostaje przez to dostępu.
        $this->upload($this->url($prefix, $lesson), ['title' => 'Nagranie'])
            ->assertStatus(429)
            ->assertJsonPath('error.code', 'too_many_requests');

        $this->assertSame([], $this->providerRequests());
    }

    /** @return array<string, array{string, string}> */
    public static function refusedRoles(): array
    {
        return [
            'uczestnik na trasie prowadzacego' => ['volunteer', 'instructor'],
            'student na trasie administracji' => ['student', 'admin'],
            'prowadzacy na trasie administracji' => ['instructor', 'admin'],
            'opiekun na trasie prowadzacego' => ['project_manager', 'instructor'],
        ];
    }

    public function test_a_missing_token_is_refused_with_401_not_with_the_limit(): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $this->realm();

        for ($n = 1; $n <= self::LIMIT + 3; $n++) {
            $this->upload('/api/v1/instructor/lessons/1/video-uploads', ['title' => 'Nagranie'])->assertUnauthorized();
            $this->upload('/api/v1/admin/lessons/1/video-uploads', ['title' => 'Nagranie'])->assertUnauthorized();
        }
    }

    public function test_the_scope_refusal_stays_after_the_limit_and_counts_towards_it(): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $instructor = $this->uploader('instructor');
        $this->bearerFor($instructor, 'instructor');
        $foreign = $this->lessonFor('project_manager', $this->user('project_manager'));

        for ($n = 1; $n <= self::LIMIT; $n++) {
            $this->upload($this->url('instructor', $foreign), ['title' => 'Nagranie'])
                ->assertNotFound()
                ->assertJsonPath('error.code', 'not_found');
        }

        // Jedenasty — nawet na własną lekcję — czeka na limit.
        $this->upload($this->url('instructor', $this->lessonFor('instructor', $instructor)), ['title' => 'Nagranie'])
            ->assertStatus(429);
        $this->assertSame([], $this->providerRequests());
    }

    // --- kurs opublikowany: wgranie nie rusza odtwarzanego nagrania ------------

    #[DataProvider('uploaders')]
    public function test_on_a_published_course_an_upload_keeps_the_playing_recording_and_puts_the_new_one_on_its_way(string $role, string $prefix): void
    {
        $this->configureBunny();
        $this->fakeProvider(['guid' => 'kazde-wideo-ma-swoj-identyfikator']);
        $person = $this->uploader($role);
        $this->bearerFor($person, $role);
        $course = $this->makeCourse(published: true);
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja opublikowanego kursu',
            'sequence_order' => 1,
            'duration_seconds' => 600,
            'video_provider_id' => 'stare-nagranie-1',
        ]);
        if ($role === 'instructor') {
            $this->assign($course, $person);
        }

        $newId = $this->upload($this->url($prefix, $lesson), ['title' => 'Nowe nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.resumed', false)
            ->json('data.video_id');
        $this->assertIsString($newId);
        $this->assertNotSame('stare-nagranie-1', $newId);

        $fresh = $lesson->fresh();
        $this->assertTrue($course->fresh()->is_published);
        $this->assertSame('stare-nagranie-1', $fresh->video_provider_id);
        $this->assertSame($newId, $fresh->video_pending_id);
        $this->assertSame('uploading', $fresh->video_status);
        $this->assertCount(1, $this->providerRequests());
    }

    // --- pomocnicze -----------------------------------------------------------

    /**
     * Każde żądanie dostaje świeży strażnik: strażnik zapamiętuje osobę z
     * pierwszego żądania i nie przepisałby ról z tokena do następnego.
     *
     * @param  array<string, mixed>  $body
     */
    private function upload(string $url, array $body): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->postJson($url, $body);
    }

    private function readStatus(string $url): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->getJson($url);
    }

    private function url(string $prefix, Lesson $lesson): string
    {
        return "/api/v1/{$prefix}/lessons/{$lesson->id}/video-uploads";
    }

    /**
     * Świeża lekcja do każdego żądania: każde zlecenie sięga wtedy do dostawcy
     * (wznowienie tej samej lekcji nie sięgałoby), więc licznik dostawcy jest
     * miarą każdego przyjętego żądania. Lekcja prowadzącego należy do kursu z
     * jego aktywnym przypisaniem.
     */
    private function lessonFor(string $role, User $person): Lesson
    {
        $course = $this->makeCourse(published: false);
        if ($role === 'instructor') {
            $this->assign($course, $person);
        }

        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja '.++$this->order,
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
    }

    private function makeCourse(bool $published): Course
    {
        return Course::create([
            'title' => 'Kurs '.uniqid(),
            'slug' => 'kurs-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->edition()->id,
            'is_published' => $published,
        ]);
    }

    private function uploader(string $role): User
    {
        return $this->user($role);
    }

    private function user(string $role): User
    {
        return User::factory()->role($role)->create(['keycloak_sub' => (string) Str::uuid()]);
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

    private function realm(): KeycloakTokenFactory
    {
        if ($this->realm === null) {
            $this->realm = (new KeycloakTokenFactory)->installAsRealm();
            Http::preventStrayRequests();
        }

        return $this->realm;
    }

    /**
     * Atrapa dostawcy nagrań — po zainstalowaniu atrapy dostawcy tożsamości, nie przed nią.
     *
     * @param  array<string, mixed>  $body
     */
    private function fakeProvider(array $body): void
    {
        $this->realm();
        // Dostawca nadaje każdemu nowemu wideo własny identyfikator (dwie lekcje nie
        // mogą dostać tego samego), więc `guid` jest za każdym razem inny.
        Http::fake(['*' => function () use ($body) {
            if (isset($body['guid'])) {
                $body['guid'] = (string) Str::uuid();
            }

            return Http::response($body);
        }]);
    }

    private function bearerFor(User $user, string $role): void
    {
        $realm = $this->realm();
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$realm->mint([
            'sub' => $user->keycloak_sub,
            'realm_access' => ['roles' => [config("keycloak.roles.{$role}")]],
        ]));
    }

    /** @return list<Request> żądania do atrapy dostawcy nagrań (bez dostawcy tożsamości) */
    private function providerRequests(): array
    {
        return Http::recorded(
            fn (Request $request): bool => ! str_starts_with($request->url(), KeycloakTokenFactory::ISSUER),
        )
            ->map(fn (array $pair): Request => $pair[0])
            ->values()
            ->all();
    }

    private function configureBunny(): void
    {
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
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
