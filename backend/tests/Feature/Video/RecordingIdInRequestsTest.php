<?php

namespace Tests\Feature\Video;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Identyfikator nagrania lekcji w adresach, które serwer buduje z kluczem
 * usługi wideo: odczyt stanu (`GET /admin/lessons/{id}/video-status`), zlecenie
 * wgrania (`POST /admin/lessons/{id}/video-uploads`) i link do odtwarzania
 * (`GET /lessons/{id}/video-link`).
 *
 * Żadne żądanie nie opuszcza procesu: `Http::fake` łapie wszystko pod `*`,
 * a asercje dotyczą adresów, które serwer próbował zawołać. Wartości, które
 * nie spełniają wzorca, wstawiane są do bazy BEZPOŚREDNIO (jak po starym
 * zapisie albo ręcznej poprawce), bo przez API nie da się ich już zapisać.
 */
class RecordingIdInRequestsTest extends TestCase
{
    use RefreshDatabase;

    private const string LIBRARY = 'test-library';

    private const string API_KEY = 'test-api-key';

    /** @return array<string, array{string}> */
    public static function storedIdsOutsideThePattern(): array
    {
        return [
            'path into another library' => ['../../library/0/videos/x'],
            'parent directory' => ['../x'],
            'slash' => ['a/b'],
            'question mark' => ['x?y=1'],
            'percent-encoded dots' => ['%2e%2e'],
            'sixty five characters' => [str_repeat('a', 65)],
            'empty string' => [''],
        ];
    }

    public function test_status_asks_the_provider_for_a_conforming_id_at_the_same_address_as_before(): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
        $lesson = $this->lesson($this->course(), 'mock-etap-1-3');
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $response = $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")->assertOk();

        $this->assertSame('finished', $response->json('data.status'));
        $this->assertSame(125, $response->json('data.duration_seconds'));
        $this->assertStringStartsWith(
            'https://iframe.mediadelivery.net/embed/'.self::LIBRARY.'/mock-etap-1-3?token=',
            $response->json('data.preview_embed_url'),
        );

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'GET'
            && $request->url() === 'https://video.bunnycdn.com/library/'.self::LIBRARY.'/videos/mock-etap-1-3'
            && $request->header('AccessKey') === [self::API_KEY]);
    }

    #[DataProvider('storedIdsOutsideThePattern')]
    public function test_status_sends_nothing_for_a_stored_id_outside_the_pattern(string $stored): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
        $lesson = $this->lesson($this->course(), null);
        DB::table('lessons')->where('id', $lesson->id)->update(['video_provider_id' => $stored]);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")
            ->assertOk()
            ->assertExactJson(['data' => ['status' => 'no_video']]);

        Http::assertNothingSent();
    }

    public function test_status_of_a_lesson_without_a_recording_sends_nothing(): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
        $lesson = $this->lesson($this->course(), null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->getJson("/api/v1/admin/lessons/{$lesson->id}/video-status")
            ->assertOk()
            ->assertExactJson(['data' => ['status' => 'no_video']]);

        Http::assertNothingSent();
    }

    public function test_upload_permission_stores_and_returns_a_conforming_guid(): void
    {
        $this->configureBunny();
        $guid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
        Http::fake(['*' => Http::response(['guid' => $guid])]);
        $lesson = $this->lesson($this->course(), null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $response = $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertCreated();

        $this->assertSame($guid, $response->json('data.video_id'));
        $this->assertSame($guid, $lesson->fresh()->video_provider_id);
        $this->assertSame(
            hash('sha256', self::LIBRARY.self::API_KEY.$response->json('data.expiration_time').$guid),
            $response->json('data.signature'),
        );

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://video.bunnycdn.com/library/'.self::LIBRARY.'/videos');
    }

    #[DataProvider('guidsOutsideThePattern')]
    public function test_upload_permission_refuses_a_guid_outside_the_pattern(string $guid): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response(['guid' => $guid])]);
        $lesson = $this->lesson($this->course(), null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson("/api/v1/admin/lessons/{$lesson->id}/video-uploads", ['title' => 'Nagranie'])
            ->assertStatus(502)
            ->assertJsonPath('error.code', 'bunny_error');

        $this->assertNull($lesson->fresh()->video_provider_id);
    }

    /** @return array<string, array{string}> */
    public static function guidsOutsideThePattern(): array
    {
        return [
            'parent directory' => ['../x'],
            'sixty five characters' => [str_repeat('a', 65)],
        ];
    }

    public function test_recording_link_for_a_conforming_id_keeps_its_address(): void
    {
        $this->configureBunny();
        $lesson = $this->lesson($this->course(['sequence_order' => 1, 'is_published' => true]), 'mock-nagranie-1');
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->assertOk();

        $this->assertSame('mock-nagranie-1', $response->json('data.video_id'));
        $this->assertStringStartsWith('https://cdn.example.test/bcdn_token=HS256-', $response->json('data.url'));
        $this->assertStringContainsString('&token_path=%2Fmock-nagranie-1%2F&viewer=', $response->json('data.url'));
        $this->assertStringEndsWith('/mock-nagranie-1/playlist.m3u8', $response->json('data.url'));
    }

    #[DataProvider('storedIdsOutsideThePattern')]
    public function test_recording_link_is_not_issued_for_a_stored_id_outside_the_pattern(string $stored): void
    {
        $this->configureBunny();
        Http::fake(['*' => Http::response([])]);
        $lesson = $this->lesson($this->course(['sequence_order' => 1, 'is_published' => true]), null);
        DB::table('lessons')->where('id', $lesson->id)->update(['video_provider_id' => $stored]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'video_missing');

        $this->assertNull($response->json('data'));
        Http::assertNothingSent();
    }

    private function configureBunny(): void
    {
        Config::set('services.bunny.api_key', self::API_KEY);
        Config::set('services.bunny.library_id', self::LIBRARY);
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function course(array $overrides = []): Course
    {
        return Course::create([
            'title' => 'Kurs z nagraniem '.uniqid(),
            'slug' => 'kurs-z-nagraniem-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
            ...$overrides,
        ]);
    }

    private function lesson(Course $course, ?string $videoId): Lesson
    {
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

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }
}
