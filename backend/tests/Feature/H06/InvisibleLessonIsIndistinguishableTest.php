<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RegisteredRoute;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionNamedType;
use Tests\TestCase;

/**
 * Uczestnik nie może po odpowiedzi odróżnić lekcji istniejącej, ale dla niego
 * niewidocznej (szkic; kurs jawny cudzej grupy produktowej), od lekcji
 * nieistniejącej. Dotyczy KAŻDEJ trasy dostępnej dla roli uczestnika, która
 * przyjmuje parametr w adresie — niezależnie od prefiksu adresu i nazwy
 * parametru.
 *
 * Listę tras czyta się z rejestru tras aplikacji w chwili próby, a nie z listy
 * wpisanej ręcznie. Trasę pomija się wyłącznie wtedy, gdy jej pośrednik roli
 * nie wpuszcza roli osoby z próby. Każda trasa jest wołana z trzema ciałami
 * (poprawnym, pustym i błędnym) oraz z ustawionym i z nieustawionym podpisem
 * nagrań. Trasa zapisująca (POST, PUT, PATCH, DELETE) musi mieć w tabeli ciał
 * własny wpis z ciałem poprawnym — brak wpisu czerwieni próbę czytelnym
 * komunikatem, trasy się nie pomija.
 *
 * Trasa lekcji (adres pod `/lessons/{…}` albo `/lesson/{…}`, parametr z
 * „lesson” w nazwie albo parametr akcji typu `Lesson`) musi dodatkowo
 * odpowiadać w obu przypadkach `404 not_found`.
 */
class InvisibleLessonIsIndistinguishableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Nagłówki, które z natury różnią się między dwoma żądaniami, więc nie
     * wchodzą do porównania: czas odpowiedzi i liczniki limitu żądań (każde
     * żądanie zużywa jedno użycie okna).
     */
    private const VARYING_HEADERS = ['date', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];

    /** Metody, których trasa wymaga własnego wpisu z ciałem w tabeli prób. */
    private const WRITING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

    /**
     * Identyfikator lekcji ukrytej: dużo wyżej niż jakikolwiek wiersz próby,
     * żeby wstawiony w parametr trasy innej niż lekcja nie trafił przypadkiem
     * w istniejący rekord innej tabeli.
     */
    private const HIDDEN_LESSON_ID = 7_000_001;

    private const MISSING_LESSON_ID = 7_001_001;

    /**
     * Ciała poprawne tras zapisujących: klucz `METODA uri-z-rejestru`.
     *
     * @var array<string, array<string, mixed>>
     */
    private const BODIES = [
        'POST api/v1/lessons/{id}/progress' => ['watched_delta' => 5, 'active_delta' => 5],
        'POST api/v1/lessons/{id}/complete' => [],
        'POST api/v1/lessons/{id}/questions' => ['question' => 'Czy to jest jasne?'],
        'PATCH api/v1/internship/entries/{id}' => ['hours' => '2.5', 'description' => 'Dyżur bez danych osób.'],
        'POST api/v1/legal-documents/{type}/accept' => ['version' => 'v1'],
        'DELETE api/v1/notifications/{id}' => [],
        'POST api/v1/notifications/{id}/read' => [],
        'POST api/v1/notifications/{id}/unread' => [],
        'POST api/v1/supervision/slots/{id}/signup' => [],
        'DELETE api/v1/supervision/slots/{id}/signup' => [],
        'POST api/v1/tests/{test}/attempts' => ['answers' => ['1' => 1]],
        'POST api/v1/threads/{thread}/messages' => ['body' => 'Dzień dobry.'],
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake();
        $this->configureSigning(true);
    }

    /** @return array<string, array{string, string}> */
    public static function rolesAndHiddenKinds(): array
    {
        $data = [];

        foreach (['volunteer', 'student'] as $role) {
            foreach (['draft', 'public course of another group'] as $kind) {
                $data["{$role}, {$kind}"] = [$role, $kind];
            }
        }

        return $data;
    }

    #[DataProvider('rolesAndHiddenKinds')]
    public function test_an_invisible_lesson_is_answered_byte_for_byte_like_a_missing_one_on_every_participant_route(string $role, string $kind): void
    {
        $this->assertSame([], $this->disabledRouteFlags(), 'Flaga funkcji wyłączona w procesie próby — trasy pod nią nie są w rejestrze i nie zostałyby sprawdzone.');

        $participant = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
        $hidden = $this->hiddenLesson($kind);
        $this->assertNull(Lesson::query()->withTrashed()->find(self::MISSING_LESSON_ID));
        $this->actingAs($participant, 'keycloak');

        $routes = $this->participantRoutesWithParameters($role);
        $lessonRoutes = array_filter($routes, fn (array $route): bool => $route['lesson']);
        $this->assertNotEmpty($lessonRoutes, 'Rejestr tras nie niesie żadnej trasy uczestnika z parametrem lekcji.');

        $before = $this->rowCounts();
        $problems = [];
        $compared = 0;

        foreach ($routes as $route) {
            $label = "{$route['method']} /{$route['uri']}";
            $valid = $this->bodyFor($route['method'], $route['uri']);

            if ($valid === null) {
                $problems[] = "{$label}: trasa zapisująca nie ma wpisu z ciałem w tabeli prób (BODIES) — dopisz wpis, trasy się nie pomija.";

                continue;
            }

            // Trasa, dla której ciałem poprawnym jest ciało puste, nie jest wołana dwa razy tym samym ciałem.
            $bodies = $valid === []
                ? ['ciało poprawne i puste' => [], 'ciało błędne' => $this->brokenBody($valid)]
                : ['ciało poprawne' => $valid, 'ciało puste' => [], 'ciało błędne' => $this->brokenBody($valid)];

            foreach (['podpis nagrań ustawiony' => true, 'bez podpisu nagrań' => false] as $configName => $signing) {
                $this->configureSigning($signing);

                foreach ($bodies as $bodyName => $body) {
                    foreach ($this->fillings($route['uri'], $hidden) as $fillName => [$invisibleUri, $missingUri]) {
                        $where = "{$label} [{$bodyName}; {$configName}; {$fillName}]";
                        $invisible = $this->json($route['method'], '/'.$invisibleUri, $body);
                        $missing = $this->json($route['method'], '/'.$missingUri, $body);
                        $compared++;

                        if ($route['lesson']) {
                            foreach ([['lekcja niewidoczna', $invisible], ['lekcja nieistniejąca', $missing]] as [$name, $response]) {
                                if ($response->status() !== 404 || $response->json('error.code') !== 'not_found') {
                                    $problems[] = "{$where}: {$name} → status {$response->status()}, kod ".var_export($response->json('error.code'), true).', oczekiwano 404 not_found.';
                                }
                            }
                        }

                        if ($invisible->status() !== $missing->status()) {
                            $problems[] = "{$where}: status różny ({$invisible->status()} wobec {$missing->status()}).";
                        }

                        if ($invisible->getContent() !== $missing->getContent()) {
                            $problems[] = "{$where}: ciało różne — niewidoczna: {$invisible->getContent()} · nieistniejąca: {$missing->getContent()}";
                        }

                        if ($this->comparableHeaders($invisible) !== $this->comparableHeaders($missing)) {
                            $problems[] = "{$where}: nagłówki różne — niewidoczna: ".json_encode($this->comparableHeaders($invisible)).' · nieistniejąca: '.json_encode($this->comparableHeaders($missing));
                        }
                    }
                }
            }
        }

        $this->assertSame([], $problems, "Odpowiedzi różnią się dla {$role} ({$kind}):\n".implode("\n", $problems));
        $this->assertGreaterThanOrEqual(count($routes) * 4, $compared);

        // Odmowy niczego nie zapisują i nie sięgają do dostawcy nagrań.
        $this->assertSame($before, $this->rowCounts(), 'Odmowa zostawiła zapis.');
        Http::assertNothingSent();
    }

    // ------------------------------------------------------------------

    /**
     * Trasy z co najmniej jednym parametrem w adresie, odczytane z rejestru,
     * bez tras, których pośrednik roli nie wpuszcza roli z próby.
     *
     * @return list<array{method: string, uri: string, lesson: bool}>
     */
    private function participantRoutesWithParameters(string $role): array
    {
        $found = [];

        /** @var RegisteredRoute $route */
        foreach (app('router')->getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/') || $route->parameterNames() === [] || ! $this->roleMayEnter($route, $role)) {
                continue;
            }

            foreach ($route->methods() as $method) {
                if ($method !== 'HEAD') {
                    $found[] = ['method' => $method, 'uri' => $uri, 'lesson' => $this->isLessonRoute($route)];
                }
            }
        }

        usort($found, fn (array $a, array $b): int => [$a['uri'], $a['method']] <=> [$b['uri'], $b['method']]);

        return $found;
    }

    private function roleMayEnter(RegisteredRoute $route, string $role): bool
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, 'role:')) {
                $allowed = explode(',', substr($middleware, strlen('role:')));

                if (! in_array($role, $allowed, true)) {
                    return false;
                }
            }
        }

        return true;
    }

    private function isLessonRoute(RegisteredRoute $route): bool
    {
        if (preg_match('#(^|/)lessons?/\{[^}]+\}#', $route->uri())) {
            return true;
        }

        foreach ($route->parameterNames() as $name) {
            if (stripos($name, 'lesson') !== false) {
                return true;
            }
        }

        foreach ($route->signatureParameters() as $parameter) {
            $type = $parameter->getType();

            if ($type instanceof ReflectionNamedType && is_a($type->getName(), Lesson::class, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Wypełnienia adresu: każdy parametr identyfikatorem lekcji; przy kilku
     * parametrach dodatkowo każdy parametr osobno identyfikatorem lekcji, a
     * pozostałe — kursem lekcji ukrytej (slug dla parametru z „slug” w nazwie,
     * inaczej identyfikator kursu).
     *
     * @return array<string, array{string, string}>
     */
    private function fillings(string $uri, Lesson $hidden): array
    {
        preg_match_all('#\{([^}?:]+)[^}]*\}#', $uri, $matches);
        $names = $matches[1];

        $fill = function (?string $target, int $lessonId) use ($uri, $hidden): string {
            return (string) preg_replace_callback('#\{([^}?:]+)[^}]*\}#', function (array $m) use ($target, $lessonId, $hidden): string {
                if ($target === null || $m[1] === $target) {
                    return (string) $lessonId;
                }

                return stripos($m[1], 'slug') !== false ? (string) $hidden->course->slug : (string) $hidden->course_id;
            }, $uri);
        };

        $fillings = ['każdy parametr = lekcja' => [$fill(null, self::HIDDEN_LESSON_ID), $fill(null, self::MISSING_LESSON_ID)]];

        if (count($names) > 1) {
            foreach ($names as $name) {
                $fillings["{{$name}} = lekcja, reszta = kurs"] = [$fill($name, self::HIDDEN_LESSON_ID), $fill($name, self::MISSING_LESSON_ID)];
            }
        }

        return $fillings;
    }

    /** @return array<string, mixed>|null null = trasa zapisująca bez wpisu w tabeli ciał */
    private function bodyFor(string $method, string $uri): ?array
    {
        if (array_key_exists("{$method} {$uri}", self::BODIES)) {
            return self::BODIES["{$method} {$uri}"];
        }

        return in_array($method, self::WRITING_METHODS, true) ? null : [];
    }

    /**
     * Ciało niespełniające reguł: każde pole poprawnego ciała dostaje tablicę
     * w miejscu wartości prostej.
     *
     * @param  array<string, mixed>  $valid
     * @return array<string, mixed>
     */
    private function brokenBody(array $valid): array
    {
        if ($valid === []) {
            return ['nieznane_pole' => ['niepoprawne']];
        }

        return array_map(fn (): array => ['niepoprawne'], $valid);
    }

    private function configureSigning(bool $signing): void
    {
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', $signing ? 'test-security-key' : '');
    }

    /**
     * Flagi funkcji, od których zależy rejestracja tras, wyłączone w procesie
     * próby: każda pozycja `config/features.php` i każde odwołanie
     * `config('features.…')` w plikach tras (z wartością domyślną, jeśli ją ma).
     *
     * @return list<string>
     */
    private function disabledRouteFlags(): array
    {
        $disabled = [];

        foreach ((array) config('features') as $name => $enabled) {
            if (! $enabled) {
                $disabled[] = "features.{$name}";
            }
        }

        $files = array_merge(glob(base_path('routes/*.php')) ?: [], glob(base_path('routes/*/*.php')) ?: []);
        $this->assertNotEmpty($files, 'Nie znaleziono plików tras.');

        foreach ($files as $file) {
            preg_match_all("#config\\('features\\.([A-Za-z0-9_]+)'(?:\\s*,\\s*(true|false))?\\)#", (string) file_get_contents($file), $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                $default = ($match[2] ?? '') === 'true';

                if (! config("features.{$match[1]}", $default)) {
                    $disabled[] = "features.{$match[1]} (".basename($file).')';
                }
            }
        }

        return array_values(array_unique($disabled));
    }

    /** @return array<string, int> */
    private function rowCounts(): array
    {
        $counts = [];

        foreach (DB::select("select tablename from pg_tables where schemaname = 'public' order by tablename") as $row) {
            $counts[$row->tablename] = DB::table($row->tablename)->count();
        }

        return $counts;
    }

    /** @return array<string, list<string|null>> */
    private function comparableHeaders(TestResponse $response): array
    {
        $headers = array_diff_key($response->headers->all(), array_flip(self::VARYING_HEADERS));
        ksort($headers);

        return $headers;
    }

    private function hiddenLesson(string $kind): Lesson
    {
        $edition = Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja próby',
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

        $draft = $kind === 'draft';

        $course = Course::create([
            'title' => 'Kurs ukryty przed osobą',
            'slug' => 'kurs-ukryty-przed-osoba',
            'type' => 'course',
            'product_group' => $draft ? 'psychon' : 'dobrostan',
            'sequence_order' => 1,
            'edition_id' => $edition->id,
            'is_published' => ! $draft,
        ]);

        // Lekcja ukryta ma gotowe nagranie: link do nagrania lekcji widocznej
        // byłby wydany, więc odmowa musi wynikać z widoczności, nie z braku nagrania.
        $lesson = new Lesson([
            'course_id' => $course->id,
            'title' => 'Lekcja ukryta przed osobą',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
        $lesson->id = self::HIDDEN_LESSON_ID;
        $lesson->save();

        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_provider_id' => 'mock-nagranie-ukryte',
            'video_status' => 'ready',
            'video_status_at' => now(),
        ]);

        return $lesson->fresh(['course']);
    }
}
