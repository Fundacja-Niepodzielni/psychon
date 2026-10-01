<?php

namespace Tests\Feature\Video;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use App\Services\Video\RecordingStateRefresher;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Stan nagrania lekcji w bazie, podmiana nagrania dopiero po gotowości i
 * wznowienie tej samej wysyłki.
 *
 * Wszystko idzie przez pełny stos tras. Dostawcę nagrań zastępuje atrapa
 * (`Http::fake`) z dwoma licznikami: „załóż nagranie” i „odczytaj stan”. Żadne
 * żądanie nie opuszcza procesu, a klucze w konfiguracji to dane próbne.
 */
class RecordingStateTest extends TestCase
{
    use RefreshDatabase;

    private const string LIBRARY = 'test-library';

    private const string OLD = 'mock-stare-nagranie';

    private const string NEW = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    private const string NEWER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    private int $createRequests = 0;

    private int $statusRequests = 0;

    /** @var list<string> identyfikatory, które atrapa wyda przy „załóż nagranie” */
    private array $guidsToIssue = [];

    /** @var array<string, mixed> identyfikator → wartość pola `status` z odczytu */
    private array $providerStatuses = [];

    /** `null` — dostawca odpowiada; `error` — odpowiedź 500; `connection` — brak odpowiedzi */
    private ?string $providerFailure = null;

    /** Wykonywane raz, w trakcie pierwszego odczytu stanu u dostawcy. */
    private ?\Closure $duringStatusRead = null;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', self::LIBRARY);
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');

        $this->travelTo(Carbon::parse('2026-10-01 12:00:00', 'UTC'));
        $this->fakeProvider();
    }

    // ------------------------------------------------------------------
    // (a) jedna tabela tłumaczenia stanów
    // ------------------------------------------------------------------

    /** @return array<string, array{mixed, string}> */
    public static function providerReadValues(): array
    {
        return [
            '0 Created' => [0, 'uploading'],
            '1 Uploaded' => [1, 'processing'],
            '2 Processing' => [2, 'processing'],
            '3 Transcoding' => [3, 'processing'],
            '5 Error' => [5, 'error'],
            '6 UploadFailed' => [6, 'error'],
            'value outside the table' => [7, 'processing'],
            'far value outside the table' => [99, 'processing'],
            'text instead of a number' => ['finished', 'processing'],
        ];
    }

    #[DataProvider('providerReadValues')]
    public function test_status_read_translates_every_provider_value_without_promoting(mixed $providerStatus, string $expected): void
    {
        $lesson = $this->lessonWith(self::OLD, self::NEW, 'uploading', now()->subMinutes(10));
        $this->providerStatuses[self::NEW] = $providerStatus;
        $this->actingAsAdmin();

        $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', $expected)
            ->assertJsonPath('data.video_ready', true)
            ->assertJsonPath('data.video_pending', true);

        $fresh = $lesson->fresh();
        $this->assertSame($expected, $fresh->video_status);
        $this->assertSame(self::OLD, $fresh->video_provider_id, 'Nagranie odtwarzane zmienia się wyłącznie po gotowości nowego.');
        $this->assertSame(self::NEW, $fresh->video_pending_id);
        $this->assertSame(1, $this->statusRequests);
    }

    public function test_a_value_outside_the_table_is_logged_without_the_recording_id(): void
    {
        Log::spy();
        $lesson = $this->lessonWith(null, self::NEW, 'uploading', now()->subMinutes(10));
        $this->providerStatuses[self::NEW] = 7;
        $this->actingAsAdmin();

        $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', 'processing')
            ->assertJsonPath('data.video_ready', false);

        $this->assertNull($lesson->fresh()->video_provider_id, 'Stan spoza tabeli nigdy nie jest „gotowe”.');

        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message, array $context = []): bool => str_contains($message, 'spoza tabeli')
                && array_keys($context) === ['provider_status']
                && ! str_contains($message.json_encode($context), self::NEW))
            ->once();
    }

    // ------------------------------------------------------------------
    // (b) odświeżanie: kto pyta dostawcę i jak często
    // ------------------------------------------------------------------

    public function test_twelve_ready_lessons_never_ask_the_provider(): void
    {
        $course = $this->course();
        $lessons = [];

        foreach (range(1, 12) as $number) {
            $lessons[] = $this->lessonWith("mock-gotowe-{$number}", null, 'ready', now()->subDay(), $course, $number);
        }

        $this->actingAsAdmin();

        $this->getJson("/api/v1/admin/courses/{$course->id}")->assertOk();
        $list = $this->getJson("/api/v1/admin/courses/{$course->id}/lessons")->assertOk();
        $this->assertSame(array_fill(0, 12, 'ready'), array_column($list->json('data'), 'video_status'));

        foreach ($lessons as $lesson) {
            $this->getJson($this->statusUrl($lesson))
                ->assertOk()
                ->assertJsonPath('data.video_status', 'ready')
                ->assertJsonPath('data.status', 'finished');
        }

        $this->assertSame(0, $this->statusRequests, 'Stan „gotowe” nie pyta dostawcy nigdy.');
        Http::assertNothingSent();
    }

    /** @return array<string, array{string|null, string|null, string|null, string}> */
    public static function statesThatNeverAsk(): array
    {
        return [
            'no recording' => [null, null, null, 'none'],
            'played, ready' => [self::OLD, null, 'ready', 'ready'],
            'played, error' => [self::OLD, null, 'error', 'error'],
            'on its way, error' => [null, self::NEW, 'error', 'error'],
            'replacement, error of the new one' => [self::OLD, self::NEW, 'error', 'error'],
        ];
    }

    #[DataProvider('statesThatNeverAsk')]
    public function test_terminal_states_never_ask_the_provider(?string $played, ?string $pending, ?string $status, string $expected): void
    {
        $lesson = $this->lessonWith($played, $pending, $status, $status === null ? null : now()->subDays(3));
        $this->actingAsAdmin();

        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', $expected);
        $this->travel(2)->hours();
        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', $expected);

        $this->assertSame(0, $this->statusRequests);
        Http::assertNothingSent();
    }

    public function test_twelve_processing_lessons_read_twice_within_the_window_ask_twelve_times(): void
    {
        $course = $this->course();
        $lessons = [];

        foreach (range(1, 12) as $number) {
            $lessons[] = $this->lessonWith(null, "mock-w-drodze-{$number}", 'processing', now()->subMinutes(5), $course, $number);
            $this->providerStatuses["mock-w-drodze-{$number}"] = 2;
        }

        $this->actingAsAdmin();

        foreach ([1, 2] as $round) {
            foreach ($lessons as $lesson) {
                $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', 'processing');
            }

            $this->travel(10)->seconds();
        }

        $this->assertSame(12, $this->statusRequests, 'Drugi odczyt tej samej lekcji przed upływem progu nie pyta dostawcy.');

        $this->travel(RecordingStateRefresher::DEFAULT_REFRESH_SECONDS)->seconds();

        foreach ($lessons as $lesson) {
            $this->getJson($this->statusUrl($lesson))->assertOk();
        }

        $this->assertSame(24, $this->statusRequests, 'Po upływie progu każda lekcja pyta ponownie — raz.');
    }

    public function test_the_refresh_threshold_is_a_configuration_constant_of_thirty_seconds(): void
    {
        $this->assertSame(30, config('services.bunny.status_refresh_seconds'));
        $this->assertSame(30, app(RecordingStateRefresher::class)->refreshSeconds());
    }

    public function test_a_second_read_arriving_during_the_provider_call_does_not_ask_again(): void
    {
        $lesson = $this->lessonWith(null, self::NEW, 'processing', now()->subMinutes(5));
        $this->providerStatuses[self::NEW] = 2;
        $secondReadResult = 'nie wykonano';

        $this->duringStatusRead = function () use ($lesson, &$secondReadResult): void {
            $secondReadResult = app(RecordingStateRefresher::class)->refresh($lesson->fresh());
        };

        $this->actingAsAdmin();
        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', 'processing');

        $this->assertNull($secondReadResult, 'Drugi, równoległy odczyt nie pyta dostawcy i dostaje stan z bazy.');
        $this->assertSame(1, $this->statusRequests, 'Dwa równoległe odczyty tej samej lekcji = jedno żądanie do dostawcy.');
    }

    /** @return array<string, array{string}> */
    public static function providerFailures(): array
    {
        return [
            'provider answers with an error' => ['error'],
            'provider does not answer' => ['connection'],
        ];
    }

    #[DataProvider('providerFailures')]
    public function test_a_provider_failure_leaves_the_state_and_its_time_unchanged(string $failure): void
    {
        $stateTime = now()->subMinutes(20);
        $lesson = $this->lessonWith(self::OLD, self::NEW, 'processing', $stateTime);
        $legacy = $this->lessonWith('mock-zastane', null, null, null, null, 2);
        $this->providerFailure = $failure;
        $this->actingAsAdmin();

        $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', 'processing')
            ->assertJsonPath('data.video_status_at', $stateTime->toIso8601ZuluString())
            ->assertJsonPath('data.video_ready', true);

        $this->getJson($this->statusUrl($legacy))
            ->assertOk()
            ->assertJsonPath('data.video_status', null)
            ->assertJsonPath('data.video_ready', true);

        $this->assertSame(2, $this->statusRequests);

        $fresh = $lesson->fresh();
        $this->assertSame('processing', $fresh->video_status);
        $this->assertSame($stateTime->getTimestamp(), $fresh->video_status_at->getTimestamp());
        $this->assertSame(self::OLD, $fresh->video_provider_id);
        $this->assertSame(self::NEW, $fresh->video_pending_id);

        $this->assertNull($legacy->fresh()->video_status);
        $this->assertNull($legacy->fresh()->video_status_at);
    }

    public function test_first_status_read_establishes_the_state_of_an_existing_recording(): void
    {
        $lesson = $this->lessonWith('mock-zastane', null, null, null);
        $this->providerStatuses['mock-zastane'] = 4;
        $this->actingAsAdmin();

        $this->getJson("/api/v1/admin/courses/{$lesson->course_id}/lessons")
            ->assertOk()
            ->assertJsonPath('data.0.video_status', null)
            ->assertJsonPath('data.0.video_ready', true)
            ->assertJsonPath('data.0.video_pending', false);
        $this->assertSame(0, $this->statusRequests, 'Zasób lekcji niesie stan z bazy, bez żądania do dostawcy.');

        $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', 'ready')
            ->assertJsonPath('data.status', 'finished')
            ->assertJsonPath('data.video_status_at', now()->toIso8601ZuluString());

        $fresh = $lesson->fresh();
        $this->assertSame('ready', $fresh->video_status);
        $this->assertSame('mock-zastane', $fresh->video_provider_id);
        $this->assertSame(600, $fresh->duration_seconds, 'Wpisany czas trwania zastanej lekcji zostaje.');
        $this->assertSame(1, $this->statusRequests);

        $this->travel(5)->minutes();
        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.duration_seconds', 600);
        $this->assertSame(1, $this->statusRequests, 'Ustalony stan „gotowe” nie pyta więcej.');
    }

    // ------------------------------------------------------------------
    // (c) link uczestnika
    // ------------------------------------------------------------------

    public function test_an_existing_recording_keeps_its_link_before_any_refresh(): void
    {
        $lesson = $this->lessonWith('mock-zastane', null, null, null);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertOk()
            ->assertJsonPath('data.video_id', 'mock-zastane');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.video_status', 'ready');

        $this->assertSame(0, $this->statusRequests + $this->createRequests);
        Http::assertNothingSent();

        // Lekcja sprzed kolumny stanu: stan w bazie pusty („nieznany”), także po
        // wydaniu linku — link niczego nie zapisuje.
        $row = DB::table('lessons')->where('id', $lesson->id)->first();
        $this->assertNull($row->video_status);
        $this->assertNull($row->video_status_at);
        $this->assertNull($row->video_pending_id);
        $this->assertSame('mock-zastane', $row->video_provider_id);

        $this->actingAsAdmin();
        $this->getJson("/api/v1/admin/courses/{$lesson->course_id}/lessons")
            ->assertOk()
            ->assertJsonPath('data.0.video_status', null)
            ->assertJsonPath('data.0.video_ready', true);
        Http::assertNothingSent();
    }

    /** @return array<string, array{string|null, string|null, string|null}> */
    public static function lessonsWithoutAReadyRecording(): array
    {
        return [
            'on its way, uploading' => [null, self::NEW, 'uploading'],
            'on its way, processing' => [null, self::NEW, 'processing'],
            'on its way, error' => [null, self::NEW, 'error'],
            'existing recording found processing' => [self::OLD, null, 'processing'],
            'existing recording found in error' => [self::OLD, null, 'error'],
        ];
    }

    #[DataProvider('lessonsWithoutAReadyRecording')]
    public function test_link_is_refused_as_not_ready_when_no_recording_is_ready(?string $played, ?string $pending, ?string $status): void
    {
        $lesson = $this->lessonWith($played, $pending, $status, now()->subMinutes(3));
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.status', 404)
            ->assertJsonPath('error.code', 'video_not_ready')
            ->assertJsonPath('error.message', 'Nagranie w przygotowaniu.');

        $this->assertNull($response->json('data'));

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.video_status', $status);

        Http::assertNothingSent();
    }

    public function test_link_for_a_lesson_without_any_recording_is_still_video_missing(): void
    {
        $lesson = $this->lessonWith(null, null, null, null);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'video_missing');

        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.video_status', 'none');
    }

    // ------------------------------------------------------------------
    // (d) podmiana dopiero po gotowości
    // ------------------------------------------------------------------

    public function test_starting_an_upload_does_not_touch_the_played_recording(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay());
        $this->guidsToIssue = [self::NEW];
        $this->actingAsAdmin();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', self::NEW)
            ->assertJsonPath('data.resumed', false);

        $fresh = $lesson->fresh();
        $this->assertSame(self::OLD, $fresh->video_provider_id, 'Rozpoczęcie wgrania nie zmienia nagrania odtwarzanego.');
        $this->assertSame(self::NEW, $fresh->video_pending_id);
        $this->assertSame('uploading', $fresh->video_status);
        $this->assertSame(now()->getTimestamp(), $fresh->video_status_at->getTimestamp());
    }

    public function test_a_recording_still_being_processed_is_not_promoted(): void
    {
        $lesson = $this->lessonWith(self::OLD, self::NEW, 'processing', now()->subMinutes(5));
        $this->providerStatuses[self::NEW] = 3;
        $this->actingAsAdmin();

        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', 'processing');

        $fresh = $lesson->fresh();
        $this->assertSame(1, $this->statusRequests);
        $this->assertSame(self::OLD, $fresh->video_provider_id, 'Podmiana następuje wyłącznie po stanie „gotowe”.');
        $this->assertSame(self::NEW, $fresh->video_pending_id);
    }

    public function test_whole_replacement_old_plays_until_the_new_one_is_ready(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay());
        $this->guidsToIssue = [self::NEW];
        $admin = User::factory()->role('super_admin')->create();
        $volunteer = $this->volunteer();

        $this->actingAs($admin, 'keycloak');
        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nowe nagranie'])->assertCreated();
        $this->assertSame(1, $this->createRequests);

        // Plik jeszcze nie dotarł, potem przetwarzanie: stare nagranie gra.
        foreach ([[0, 'uploading'], [2, 'processing']] as [$providerStatus, $expected]) {
            $this->providerStatuses[self::NEW] = $providerStatus;
            $this->travel(31)->seconds();

            $this->actingAs($admin, 'keycloak');
            $this->getJson($this->statusUrl($lesson))
                ->assertOk()
                ->assertJsonPath('data.video_status', $expected)
                ->assertJsonPath('data.status', 'processing')
                ->assertJsonPath('data.video_ready', true)
                ->assertJsonPath('data.video_pending', true);

            $this->actingAs($volunteer, 'keycloak');
            $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
                ->assertOk()
                ->assertJsonPath('data.video_id', self::OLD);
            $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.video_status', 'ready');
        }

        // Odczyt, który pierwszy widzi gotowość, robi podmianę.
        $this->providerStatuses[self::NEW] = 4;
        $this->travel(31)->seconds();

        $this->actingAs($admin, 'keycloak');
        $response = $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', 'ready')
            ->assertJsonPath('data.status', 'finished')
            ->assertJsonPath('data.video_ready', true)
            ->assertJsonPath('data.video_pending', false)
            ->assertJsonPath('data.duration_seconds', 125);
        $this->assertStringContainsString('/'.self::NEW.'?token=', (string) $response->json('data.preview_embed_url'));

        $fresh = $lesson->fresh();
        $this->assertSame(self::NEW, $fresh->video_provider_id);
        $this->assertNull($fresh->video_pending_id);
        $this->assertSame('ready', $fresh->video_status);
        $this->assertSame(125, $fresh->duration_seconds);

        $this->actingAs($volunteer, 'keycloak');
        $link = $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertOk()
            ->assertJsonPath('data.video_id', self::NEW);
        $this->assertStringNotContainsString(self::OLD, (string) $link->json('data.url'), 'Po podmianie stare nagranie już nie gra.');

        $this->assertSame(3, $this->statusRequests);
        $this->assertSame(1, $this->createRequests);
    }

    public function test_an_interrupted_upload_leaves_the_old_recording_and_the_next_one_replaces_the_one_on_its_way(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay());
        $this->guidsToIssue = [self::NEW, self::NEWER];
        $admin = User::factory()->role('super_admin')->create();

        $this->actingAs($admin, 'keycloak');
        $this->postJson($this->uploadUrl($lesson), ['title' => 'Pierwsza wysyłka'])->assertCreated();

        // Wysyłka przerwana: plik nigdy nie dotarł, okno wznowienia minęło.
        $this->travel(7)->hours();
        $this->postJson($this->uploadUrl($lesson), ['title' => 'Druga wysyłka'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', self::NEWER)
            ->assertJsonPath('data.resumed', false);

        $fresh = $lesson->fresh();
        $this->assertSame(2, $this->createRequests);
        $this->assertSame(self::OLD, $fresh->video_provider_id);
        $this->assertSame(self::NEWER, $fresh->video_pending_id);
        $this->assertSame('uploading', $fresh->video_status);

        $this->actingAs($this->volunteer(), 'keycloak');
        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->assertOk()->assertJsonPath('data.video_id', self::OLD);
    }

    public function test_an_error_of_the_recording_on_its_way_does_not_touch_the_played_one(): void
    {
        $lesson = $this->lessonWith(self::OLD, self::NEW, 'processing', now()->subMinutes(5));
        $this->providerStatuses[self::NEW] = 5;
        $this->actingAsAdmin();

        $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', 'error')
            ->assertJsonPath('data.status', 'error')
            ->assertJsonPath('data.video_ready', true);

        $fresh = $lesson->fresh();
        $this->assertSame(self::OLD, $fresh->video_provider_id);
        $this->assertSame(self::NEW, $fresh->video_pending_id);

        $this->actingAs($this->volunteer(), 'keycloak');
        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->assertOk()->assertJsonPath('data.video_id', self::OLD);
    }

    public function test_a_first_recording_has_no_link_until_it_is_ready(): void
    {
        $lesson = $this->lessonWith(null, null, null, null);
        $this->guidsToIssue = [self::NEW];
        $admin = User::factory()->role('super_admin')->create();
        $volunteer = $this->volunteer();

        $this->actingAs($admin, 'keycloak');
        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])->assertCreated();
        $this->assertNull($lesson->fresh()->video_provider_id);

        $this->actingAs($volunteer, 'keycloak');
        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'video_not_ready');

        $this->providerStatuses[self::NEW] = 4;
        $this->actingAs($admin, 'keycloak');
        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', 'ready');

        $this->actingAs($volunteer, 'keycloak');
        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->assertOk()->assertJsonPath('data.video_id', self::NEW);
    }

    public function test_starting_an_upload_drops_a_played_recording_known_to_be_broken(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'error', now()->subDay());
        $this->guidsToIssue = [self::NEW];
        $this->actingAsAdmin();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])->assertCreated();

        $fresh = $lesson->fresh();
        $this->assertNull($fresh->video_provider_id, 'Nagranie z błędem nie zostaje jako odtwarzane obok nowego.');
        $this->assertSame(self::NEW, $fresh->video_pending_id);
        $this->assertSame('uploading', $fresh->video_status);
    }

    public function test_changing_the_played_id_by_hand_returns_the_state_to_unknown(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'error', now()->subDay());
        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => 'mock-wpisane-recznie'])
            ->assertOk()
            ->assertJsonPath('data.video_provider_id', 'mock-wpisane-recznie')
            ->assertJsonPath('data.video_status', null)
            ->assertJsonPath('data.video_ready', true);

        $fresh = $lesson->fresh();
        $this->assertNull($fresh->video_status);
        $this->assertNull($fresh->video_status_at);

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['title' => 'Sam tytuł'])->assertOk();
        $this->assertNull($lesson->fresh()->video_status);
    }

    // ------------------------------------------------------------------
    // wznowienie tej samej wysyłki
    // ------------------------------------------------------------------

    public function test_a_second_permission_within_six_hours_is_for_the_same_recording(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay());
        $this->guidsToIssue = [self::NEW, self::NEWER];
        $this->actingAsAdmin();

        $first = $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])->assertCreated();
        $createdAt = $lesson->fresh()->video_status_at->getTimestamp();

        $this->travel(5)->hours();
        $this->travel(59)->minutes();

        $second = $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', self::NEW)
            ->assertJsonPath('data.resumed', true);

        $this->assertSame(1, $this->createRequests, 'Wznowienie nie zakłada nowego nagrania u dostawcy.');
        $this->assertSame(
            ['video_id', 'upload_url', 'library_id', 'expiration_time', 'signature', 'resumed'],
            array_keys($second->json('data')),
        );
        $this->assertSame(
            hash('sha256', self::LIBRARY.config('services.bunny.api_key').$second->json('data.expiration_time').self::NEW),
            $second->json('data.signature'),
        );
        $this->assertNotSame($first->json('data.signature'), $second->json('data.signature'), 'Każde uprawnienie ma własny podpis.');
        $this->assertSame(now()->addHours(6)->getTimestamp(), $second->json('data.expiration_time'));

        $fresh = $lesson->fresh();
        $this->assertSame(self::NEW, $fresh->video_pending_id);
        $this->assertSame(self::OLD, $fresh->video_provider_id);
        $this->assertSame($createdAt, $fresh->video_status_at->getTimestamp(), 'Okno liczy się od założenia nagrania.');
    }

    public function test_a_permission_after_six_hours_creates_a_new_recording(): void
    {
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay());
        $this->guidsToIssue = [self::NEW, self::NEWER];
        $this->actingAsAdmin();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])->assertCreated();
        $this->travel(6)->hours();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', self::NEWER)
            ->assertJsonPath('data.resumed', false);

        $this->assertSame(2, $this->createRequests);
        $this->assertSame(self::NEWER, $lesson->fresh()->video_pending_id);
        $this->assertSame(self::OLD, $lesson->fresh()->video_provider_id);
    }

    /** @return array<string, array{string}> */
    public static function statesThatDoNotResume(): array
    {
        return [
            'error' => ['error'],
            'processing' => ['processing'],
        ];
    }

    #[DataProvider('statesThatDoNotResume')]
    public function test_a_young_recording_that_is_not_being_uploaded_gets_a_new_one(string $status): void
    {
        $lesson = $this->lessonWith(self::OLD, self::NEW, $status, now()->subHour());
        $this->guidsToIssue = [self::NEWER];
        $this->actingAsAdmin();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', self::NEWER)
            ->assertJsonPath('data.resumed', false);

        $this->assertSame(1, $this->createRequests);
        $this->assertSame(self::NEWER, $lesson->fresh()->video_pending_id);
        $this->assertSame('uploading', $lesson->fresh()->video_status);
        $this->assertSame(self::OLD, $lesson->fresh()->video_provider_id);
    }

    // ------------------------------------------------------------------
    // niepowtarzalność identyfikatora „w drodze”
    // ------------------------------------------------------------------

    /** @return array<string, array{string}> */
    public static function columnsHoldingTheId(): array
    {
        return [
            'played in another lesson' => ['video_provider_id'],
            'on its way in another lesson' => ['video_pending_id'],
        ];
    }

    #[DataProvider('columnsHoldingTheId')]
    public function test_upload_refuses_an_id_held_by_another_lesson_in_either_column(string $column): void
    {
        $course = $this->course();
        $other = $this->lessonWith(null, null, null, null, $course, 1);
        DB::table('lessons')->where('id', $other->id)->update([$column => strtoupper(self::NEW)]);
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay(), $course, 2);
        $this->guidsToIssue = [self::NEW];
        $this->actingAsAdmin();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'bunny_error');

        $fresh = $lesson->fresh();
        $this->assertSame(self::OLD, $fresh->video_provider_id);
        $this->assertNull($fresh->video_pending_id);
        $this->assertSame('ready', $fresh->video_status);
    }

    public function test_the_id_on_its_way_is_stored_in_lower_case_and_stays_so_after_the_swap(): void
    {
        $lesson = $this->lessonWith(null, null, null, null);
        $this->guidsToIssue = [strtoupper(self::NEW)];
        $this->providerStatuses[self::NEW] = 4;
        $this->actingAsAdmin();

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', strtoupper(self::NEW))
            ->assertJsonPath('data.resumed', false);

        $row = DB::table('lessons')->where('id', $lesson->id)->first();
        $this->assertSame(self::NEW, $row->video_pending_id, 'Nagranie „w drodze” jest zapisywane małymi literami.');
        $this->assertNull($row->video_provider_id);

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertCreated()
            ->assertJsonPath('data.video_id', self::NEW)
            ->assertJsonPath('data.resumed', true);
        $this->assertSame(1, $this->createRequests);

        $this->getJson($this->statusUrl($lesson))->assertOk()->assertJsonPath('data.video_status', 'ready');

        $row = DB::table('lessons')->where('id', $lesson->id)->first();
        $this->assertSame(self::NEW, $row->video_provider_id, 'Po podmianie identyfikator odtwarzany też ma małe litery.');
        $this->assertNull($row->video_pending_id);
    }

    public function test_an_upload_that_loses_the_race_for_the_id_on_its_way_is_a_provider_error(): void
    {
        $course = $this->course();
        $lesson = $this->lessonWith(self::OLD, null, 'ready', now()->subDay(), $course, 1);
        $this->guidsToIssue = [self::NEW];
        $this->actingAsAdmin();
        // Konkurent zajmuje identyfikator po sprawdzeniu wolności, tuż przed
        // zapisem: odmawia już tylko indeks nagrania „w drodze”.
        $this->competitorTakesTheIdOnce($course, 'video_pending_id', strtoupper(self::NEW));

        $this->postJson($this->uploadUrl($lesson), ['title' => 'Nagranie'])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'bunny_error')
            ->assertJsonPath('error.message', 'Bunny Stream zwrócił identyfikator nagrania, który jest już przypisany do innej lekcji.');

        $fresh = $lesson->fresh();
        $this->assertSame(self::OLD, $fresh->video_provider_id);
        $this->assertNull($fresh->video_pending_id);
        $this->assertSame('ready', $fresh->video_status);
    }

    public function test_a_swap_that_loses_the_race_for_the_played_id_changes_nothing(): void
    {
        $course = $this->course();
        $statusAt = now()->subMinutes(5);
        $lesson = $this->lessonWith(self::OLD, self::NEW, 'processing', $statusAt, $course, 1);
        $this->providerStatuses[self::NEW] = 4;
        $this->actingAsAdmin();
        // Konkurent wpisuje ten sam identyfikator jako odtwarzany w innej lekcji
        // po sprawdzeniu wolności, tuż przed zapisem podmiany: odmawia indeks
        // nagrania odtwarzanego, a odczyt stanu odpowiada bez błędu serwera.
        $this->competitorTakesTheIdOnce($course, 'video_provider_id', strtoupper(self::NEW));

        $this->getJson($this->statusUrl($lesson))
            ->assertOk()
            ->assertJsonPath('data.video_status', 'processing')
            ->assertJsonPath('data.video_ready', true)
            ->assertJsonPath('data.video_pending', true);

        $fresh = $lesson->fresh();
        $this->assertSame(self::OLD, $fresh->video_provider_id, 'Dotychczasowe nagranie zostaje odtwarzane.');
        $this->assertSame(self::NEW, $fresh->video_pending_id);
        $this->assertSame('processing', $fresh->video_status);
        $this->assertSame($statusAt->getTimestamp(), $fresh->video_status_at->getTimestamp());
        $this->assertSame(
            0,
            DB::table('lessons')->whereRaw('lower(video_provider_id) = ?', [self::NEW])->count(),
            'Przegrany zapis niczego nie zostawia.',
        );
    }

    public function test_administration_cannot_assign_by_hand_an_id_on_its_way_in_another_lesson(): void
    {
        $course = $this->course();
        $this->lessonWith(null, self::NEW, 'uploading', now(), $course, 1);
        $lesson = $this->lessonWith(null, null, null, null, $course, 2);
        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['video_provider_id' => strtoupper(self::NEW)])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.video_provider_id.0', 'Ten identyfikator nagrania jest już przypisany do innej lekcji.');

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['title' => 'Nowa', 'video_provider_id' => self::NEW])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.video_provider_id.0', 'Ten identyfikator nagrania jest już przypisany do innej lekcji.');

        $this->assertNull($lesson->fresh()->video_provider_id);
    }

    public function test_two_live_lessons_cannot_hold_the_same_id_on_its_way(): void
    {
        $course = $this->course();
        $this->lessonWith(null, self::NEW, 'uploading', now(), $course, 1);
        $second = $this->lessonWith(null, null, null, null, $course, 2);

        $this->expectException(UniqueConstraintViolationException::class);

        DB::table('lessons')->where('id', $second->id)->update(['video_pending_id' => strtoupper(self::NEW)]);
    }

    public function test_a_deleted_lesson_releases_its_id_on_its_way(): void
    {
        $course = $this->course();
        $deleted = $this->lessonWith(null, self::NEW, 'uploading', now(), $course, 1);
        $deleted->delete();
        $second = $this->lessonWith(null, null, null, null, $course, 2);

        DB::table('lessons')->where('id', $second->id)->update(['video_pending_id' => self::NEW]);

        $this->assertSame(self::NEW, $second->fresh()->video_pending_id, 'Indeks dotyczy wyłącznie żywych lekcji.');
        $this->assertSame(2, DB::table('lessons')->where('video_pending_id', self::NEW)->count());
    }

    public function test_the_state_column_accepts_only_the_dictionary(): void
    {
        $lesson = $this->lessonWith(null, null, null, null);

        $this->expectException(QueryException::class);

        DB::table('lessons')->where('id', $lesson->id)->update(['video_status' => 'finished']);
    }

    // ------------------------------------------------------------------
    // pomocnicze
    // ------------------------------------------------------------------

    private function fakeProvider(): void
    {
        Http::fake(function (Request $request) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);

            if ($request->method() === 'POST' && str_ends_with($path, '/library/'.self::LIBRARY.'/videos')) {
                $this->createRequests++;

                return Http::response(['guid' => array_shift($this->guidsToIssue) ?? 'mock-niezamowione']);
            }

            if ($request->method() === 'GET' && str_contains($path, '/library/'.self::LIBRARY.'/videos/')) {
                $this->statusRequests++;

                if ($this->duringStatusRead !== null) {
                    $callback = $this->duringStatusRead;
                    $this->duringStatusRead = null;
                    $callback();
                }

                if ($this->providerFailure === 'connection') {
                    return Http::failedConnection()($request);
                }

                if ($this->providerFailure === 'error') {
                    return Http::response(['message' => 'awaria'], 500);
                }

                return Http::response(['status' => $this->providerStatuses[basename($path)] ?? 0, 'length' => 125]);
            }

            return Http::response([], 404);
        });
    }

    /**
     * Konkurent zapisuje ten sam identyfikator do INNEJ lekcji dokładnie raz,
     * w chwili zapisu lekcji z żądania — czyli po wszystkich sprawdzeniach
     * wolności identyfikatora.
     */
    private function competitorTakesTheIdOnce(Course $course, string $column, string $id): void
    {
        $fired = false;

        Lesson::saving(function () use (&$fired, $course, $column, $id): void {
            if ($fired) {
                return;
            }

            $fired = true;

            $competitor = Lesson::withoutEvents(fn () => Lesson::create([
                'course_id' => $course->id,
                'title' => 'Lekcja konkurenta',
                'sequence_order' => 99,
                'duration_seconds' => 600,
            ]));

            DB::table('lessons')->where('id', $competitor->id)->update([$column => $id]);
        });
    }

    private function statusUrl(Lesson $lesson): string
    {
        return "/api/v1/admin/lessons/{$lesson->id}/video-status";
    }

    private function uploadUrl(Lesson $lesson): string
    {
        return "/api/v1/admin/lessons/{$lesson->id}/video-uploads";
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        return $admin;
    }

    /**
     * Lekcja z kolumnami nagrania ustawionymi WPROST w bazie — tak jak po
     * migracji albo po wcześniejszych odczytach stanu.
     */
    private function lessonWith(
        ?string $played,
        ?string $pending,
        ?string $status,
        ?Carbon $statusAt,
        ?Course $course = null,
        int $sequenceOrder = 1,
    ): Lesson {
        $lesson = Lesson::create([
            'course_id' => ($course ?? $this->course())->id,
            'title' => 'Lekcja z nagraniem '.$sequenceOrder,
            'sequence_order' => $sequenceOrder,
            'duration_seconds' => 600,
        ]);

        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_provider_id' => $played,
            'video_pending_id' => $pending,
            'video_status' => $status,
            'video_status_at' => $statusAt,
        ]);

        return $lesson->fresh();
    }

    private function course(): Course
    {
        return Course::create([
            'title' => 'Kurs z nagraniem '.uniqid(),
            'slug' => 'kurs-z-nagraniem-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
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

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }
}
