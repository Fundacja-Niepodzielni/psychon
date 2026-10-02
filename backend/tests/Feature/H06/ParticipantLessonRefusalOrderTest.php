<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Kolejność odmów na trasach lekcji uczestnika: 401 → 404 → 403
 * `course_locked` → 403 `lesson_locked` → 422 `validation_failed` (ciało) →
 * 503 `video_not_configured` (konfiguracja podpisu). Lekcja widoczna i otwarta
 * zachowuje dotychczasowe odpowiedzi: 422 przy złym ciele, 503 bez podpisu,
 * 200/201 przy poprawnym żądaniu.
 */
class ParticipantLessonRefusalOrderTest extends TestCase
{
    use RefreshDatabase;

    private int $recordings = 0;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake();
        $this->configureSigning(true);
    }

    /** @return array<string, array{string}> */
    public static function participants(): array
    {
        return ['volunteer' => ['volunteer'], 'student' => ['student']];
    }

    #[DataProvider('participants')]
    public function test_a_visible_open_lesson_keeps_the_existing_answers(string $role): void
    {
        [, $lessons] = $this->courseWithLessons(2, 1);
        $this->actingAs($this->participant($role), 'keycloak');
        $open = $lessons[0]->id;

        $this->postJson("/api/v1/lessons/{$open}/progress", [])
            ->assertStatus(422)->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonValidationErrors(['watched_delta', 'active_delta'], 'error.errors');
        $this->postJson("/api/v1/lessons/{$open}/progress", ['watched_delta' => ['x'], 'active_delta' => -1])
            ->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->postJson("/api/v1/lessons/{$open}/progress", ['watched_delta' => 5, 'active_delta' => 5])
            ->assertOk()->assertJsonPath('data.watched_seconds', 5);

        $this->postJson("/api/v1/lessons/{$open}/questions", [])
            ->assertStatus(422)->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.question.0', 'Wpisz treść pytania.');
        $this->postJson("/api/v1/lessons/{$open}/questions", ['question' => '  Czy to jest jasne?  '])
            ->assertCreated()->assertJsonPath('data.question', 'Czy to jest jasne?');

        $this->configureSigning(false);
        $this->getJson("/api/v1/lessons/{$open}/video-link")
            ->assertStatus(503)->assertJsonPath('error.code', 'video_not_configured');

        $this->configureSigning(true);
        $this->getJson("/api/v1/lessons/{$open}/video-link")->assertOk()->assertJsonStructure(['data' => ['url', 'embed_url']]);

        Http::assertNothingSent();
    }

    #[DataProvider('participants')]
    public function test_a_closed_lesson_is_refused_before_the_body_and_the_signing_configuration(string $role): void
    {
        [, $lessons] = $this->courseWithLessons(2, 1);
        $user = $this->participant($role);
        $this->actingAs($user, 'keycloak');
        $closed = $lessons[1]->id;
        $this->configureSigning(false);

        foreach ([
            ['POST', "/api/v1/lessons/{$closed}/progress", []],
            ['POST', "/api/v1/lessons/{$closed}/progress", ['watched_delta' => ['x']]],
            ['POST', "/api/v1/lessons/{$closed}/questions", []],
            ['GET', "/api/v1/lessons/{$closed}/video-link", []],
        ] as [$method, $url, $body]) {
            $this->json($method, $url, $body)
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'lesson_locked')
                ->assertJsonPath('error.reason.required_lesson_id', $lessons[0]->id);
        }

        $this->assertSame(0, DB::table('lesson_progress')->where('user_id', $user->id)->count());
        $this->assertSame(0, DB::table('instructor_questions')->where('user_id', $user->id)->count());
        Http::assertNothingSent();
    }

    public function test_a_locked_course_is_refused_before_the_body_and_the_signing_configuration(): void
    {
        $this->courseWithLessons(1, 1);
        [, $lessons] = $this->courseWithLessons(1, 2);
        $this->actingAs($this->participant('volunteer'), 'keycloak');
        $this->configureSigning(false);
        $lesson = $lessons[0]->id;

        foreach ([
            ['POST', "/api/v1/lessons/{$lesson}/progress", []],
            ['POST', "/api/v1/lessons/{$lesson}/questions", []],
            ['GET', "/api/v1/lessons/{$lesson}/video-link", []],
        ] as [$method, $url, $body]) {
            $this->json($method, $url, $body)->assertStatus(403)->assertJsonPath('error.code', 'course_locked');
        }

        Http::assertNothingSent();
    }

    public function test_a_guest_is_refused_with_401_before_anything_else(): void
    {
        [, $lessons] = $this->courseWithLessons(1, 1);
        $this->configureSigning(false);
        $lesson = $lessons[0]->id;

        $this->postJson("/api/v1/lessons/{$lesson}/progress", [])->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
        $this->postJson("/api/v1/lessons/{$lesson}/questions", [])->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
        $this->getJson("/api/v1/lessons/{$lesson}/video-link")->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
    }

    // ------------------------------------------------------------------

    private function configureSigning(bool $signing): void
    {
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', $signing ? 'test-security-key' : '');
    }

    private function participant(string $role): User
    {
        return User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
    }

    /** @return array{Course, list<Lesson>} */
    private function courseWithLessons(int $count, int $order): array
    {
        $course = Course::create([
            'title' => 'Kurs '.$order,
            'slug' => 'kurs-kolejnosci-odmow-'.$order,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
        ]);

        $lessons = [];

        for ($i = 1; $i <= $count; $i++) {
            $lesson = Lesson::create([
                'course_id' => $course->id,
                'title' => 'Lekcja '.$i,
                'sequence_order' => $i,
                'duration_seconds' => 600,
            ]);

            $this->recordings++;
            DB::table('lessons')->where('id', $lesson->id)->update([
                'video_provider_id' => 'mock-nagranie-odmowy-'.$this->recordings,
                'video_status' => 'ready',
                'video_status_at' => now(),
            ]);

            $lessons[] = $lesson->fresh();
        }

        return [$course, $lessons];
    }

    private function edition(): Edition
    {
        return Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja kolejności odmów',
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
