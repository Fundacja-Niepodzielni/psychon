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
use Tests\TestCase;

/**
 * Uczestnik nie może po odpowiedzi odróżnić lekcji istniejącej, ale dla niego
 * niewidocznej (szkic; kurs jawny cudzej grupy produktowej), od lekcji
 * nieistniejącej. Dotyczy KAŻDEJ trasy uczestnika z parametrem lekcji.
 *
 * Listę tras czyta się z rejestru tras aplikacji w chwili próby, a nie z listy
 * wpisanej ręcznie: nowa trasa pod `/lessons/{…}` wchodzi do próby sama.
 * Trasa zapisująca (POST, PUT, PATCH, DELETE) musi mieć w tabeli ciał własny
 * wpis — brak wpisu czerwieni próbę czytelnym komunikatem, trasy się nie pomija.
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
     * Ciała żądań tras zapisujących: klucz `METODA uri-z-rejestru`.
     *
     * @var array<string, array<string, mixed>>
     */
    private const BODIES = [
        'POST api/v1/lessons/{id}/progress' => ['watched_delta' => 5, 'active_delta' => 5],
        'POST api/v1/lessons/{id}/complete' => [],
        'POST api/v1/lessons/{id}/questions' => ['question' => 'Czy to jest jasne?'],
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake();
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
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
        $participant = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
        $hidden = $this->hiddenLesson($kind);
        $missingId = (int) Lesson::query()->withTrashed()->max('id') + 1000;
        $this->actingAs($participant, 'keycloak');

        $routes = $this->participantLessonRoutes();
        $this->assertNotEmpty($routes, 'Rejestr tras nie niesie żadnej trasy uczestnika z parametrem lekcji.');

        $tables = ['instructor_questions', 'lesson_progress'];
        $before = array_map(fn (string $table): int => DB::table($table)->count(), $tables);

        $problems = [];

        foreach ($routes as $route) {
            $label = "{$route['method']} /{$route['uri']}";
            $body = $this->bodyFor($route['method'], $route['uri']);

            if ($body === null) {
                $problems[] = "{$label}: trasa zapisująca nie ma wpisu z ciałem w tabeli prób (BODIES) — dopisz wpis, trasy się nie pomija.";

                continue;
            }

            $invisible = $this->json($route['method'], '/'.$this->fill($route['uri'], $hidden->id), $body);
            $missing = $this->json($route['method'], '/'.$this->fill($route['uri'], $missingId), $body);

            foreach ([['lekcja niewidoczna', $invisible], ['lekcja nieistniejąca', $missing]] as [$name, $response]) {
                if ($response->status() !== 404 || $response->json('error.code') !== 'not_found') {
                    $problems[] = "{$label}: {$name} → status {$response->status()}, kod ".var_export($response->json('error.code'), true).', oczekiwano 404 not_found.';
                }
            }

            if ($invisible->status() !== $missing->status()) {
                $problems[] = "{$label}: status różny ({$invisible->status()} wobec {$missing->status()}).";
            }

            if ($invisible->getContent() !== $missing->getContent()) {
                $problems[] = "{$label}: ciało różne — niewidoczna: {$invisible->getContent()} · nieistniejąca: {$missing->getContent()}";
            }

            if ($this->comparableHeaders($invisible) !== $this->comparableHeaders($missing)) {
                $problems[] = "{$label}: nagłówki różne — niewidoczna: ".json_encode($this->comparableHeaders($invisible)).' · nieistniejąca: '.json_encode($this->comparableHeaders($missing));
            }
        }

        $this->assertSame([], $problems, "Odpowiedzi różnią się dla {$role} ({$kind}):\n".implode("\n", $problems));

        // Odmowy niczego nie zapisują i nie sięgają do dostawcy nagrań.
        $this->assertSame($before, array_map(fn (string $table): int => DB::table($table)->count(), $tables), 'Odmowa zostawiła zapis.');
        Http::assertNothingSent();
    }

    // ------------------------------------------------------------------

    /**
     * Trasy uczestnika z parametrem lekcji, odczytane z rejestru: wszystko pod
     * `/lessons/{…}` oraz każda inna trasa z parametrem `lesson` poza grupami
     * administracji i prowadzącego.
     *
     * @return list<array{method: string, uri: string}>
     */
    private function participantLessonRoutes(): array
    {
        $found = [];

        /** @var RegisteredRoute $route */
        foreach (app('router')->getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();

            $underLessons = (bool) preg_match('#^api/v1/lessons/\{[^}]+\}(/|$)#', $uri);
            $lessonParameter = in_array('lesson', $route->parameterNames(), true)
                && ! str_starts_with($uri, 'api/v1/admin/')
                && ! str_starts_with($uri, 'api/v1/instructor/');

            if (! $underLessons && ! $lessonParameter) {
                continue;
            }

            foreach ($route->methods() as $method) {
                if ($method !== 'HEAD') {
                    $found[] = ['method' => $method, 'uri' => $uri];
                }
            }
        }

        usort($found, fn (array $a, array $b): int => [$a['uri'], $a['method']] <=> [$b['uri'], $b['method']]);

        return $found;
    }

    /** @return array<string, mixed>|null null = trasa zapisująca bez wpisu w tabeli ciał */
    private function bodyFor(string $method, string $uri): ?array
    {
        if (array_key_exists("{$method} {$uri}", self::BODIES)) {
            return self::BODIES["{$method} {$uri}"];
        }

        return in_array($method, self::WRITING_METHODS, true) ? null : [];
    }

    private function fill(string $uri, int $lessonId): string
    {
        return (string) preg_replace('#\{[^}]+\}#', (string) $lessonId, $uri);
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

        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja ukryta przed osobą',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);
    }
}
