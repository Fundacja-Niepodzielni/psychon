<?php

namespace Tests\Unit\Services\Video;

use App\Models\Lesson;
use App\Models\User;
use App\Services\Video\VideoTokenService;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;

/**
 * Boots the application for `config()` and the clock only; no database
 * connection is opened (see `Tests\Unit\Services\H12\SupervisionTimingTest`).
 */
class VideoTokenServiceTest extends TestCase
{
    private const NOW = 1790000000;

    private VideoTokenService $service;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.bunny' => [
            'api_key' => 'test-api-key',
            'library_id' => '4242',
            'cdn_hostname' => 'cdn.example.test',
            'token_security_key' => 'test-security-key',
        ]]);
        $this->travelTo(Carbon::createFromTimestamp(self::NOW));
        $this->service = new VideoTokenService;
    }

    public function test_it_is_configured_when_all_four_keys_are_set(): void
    {
        $this->assertTrue($this->service->isConfigured());
    }

    #[DataProvider('bunnyKeys')]
    public function test_it_is_not_configured_when_any_key_is_empty(string $key): void
    {
        config(["services.bunny.{$key}" => '']);
        $this->assertFalse($this->service->isConfigured());

        config(["services.bunny.{$key}" => null]);
        $this->assertFalse($this->service->isConfigured());
    }

    /** @return array<string, array{string}> */
    public static function bunnyKeys(): array
    {
        return [
            'api_key' => ['api_key'],
            'library_id' => ['library_id'],
            'cdn_hostname' => ['cdn_hostname'],
            'token_security_key' => ['token_security_key'],
        ];
    }

    public function test_cdn_url_is_a_directory_token_for_the_lesson_playlist(): void
    {
        $signed = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(17));

        $this->assertSame('vid-1', $signed['video_id']);
        $this->assertSame(self::NOW + VideoTokenService::CDN_TTL_SECONDS, $signed['expires_at']);
        $this->assertStringStartsWith('https://cdn.example.test/bcdn_token=HS256-', $signed['url']);
        $this->assertStringContainsString('&token_path=%2Fvid-1%2F&viewer=', $signed['url']);
        $this->assertStringEndsWith('&expires='.$signed['expires_at'].'/vid-1/playlist.m3u8', $signed['url']);
    }

    public function test_cdn_url_is_deterministic_for_the_same_viewer_and_second(): void
    {
        $first = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(17));
        $second = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(17));

        $this->assertSame($first['url'], $second['url']);
    }

    public function test_cdn_url_is_bound_to_the_viewer(): void
    {
        $mine = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(17));
        $theirs = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(18));

        $this->assertNotSame($this->tokenOf($mine['url']), $this->tokenOf($theirs['url']));
        $this->assertStringNotContainsString('viewer=17', $mine['url']);
    }

    public function test_cdn_token_depends_on_the_security_key(): void
    {
        $before = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(17));
        config(['services.bunny.token_security_key' => 'rotated-key']);
        $after = $this->service->signedCdnUrl($this->lesson('vid-1'), $this->user(17));

        $this->assertNotSame($this->tokenOf($before['url']), $this->tokenOf($after['url']));
    }

    public function test_embed_url_uses_the_documented_sha256_token(): void
    {
        $signed = $this->service->signedEmbedUrl($this->lesson('vid-2'));
        $expires = self::NOW + VideoTokenService::EMBED_TTL_SECONDS;
        $token = hash('sha256', 'test-security-key'.'vid-2'.$expires);

        $this->assertSame(
            "https://iframe.mediadelivery.net/embed/4242/vid-2?token={$token}&expires={$expires}",
            $signed['url'],
        );
        $this->assertSame($expires, $signed['expires_at']);
        $this->assertSame('vid-2', $signed['video_id']);
    }

    public function test_playback_carries_the_list_url_and_a_signed_embed_url_valid_to_the_same_moment(): void
    {
        $user = $this->user(17);
        $playback = $this->service->signedPlayback($this->lesson('vid-3'), $user);
        $expires = self::NOW + VideoTokenService::CDN_TTL_SECONDS;
        $token = hash('sha256', 'test-security-key'.'vid-3'.$expires);

        $this->assertSame(['url', 'expires_at', 'video_id', 'embed_url', 'embed_expires_at'], array_keys($playback));
        $this->assertSame($this->service->signedCdnUrl($this->lesson('vid-3'), $user)['url'], $playback['url']);
        $this->assertSame($expires, $playback['expires_at']);
        $this->assertSame($expires, $playback['embed_expires_at'], 'Adres ramki wygasa o tej samej chwili co adres listy.');
        $this->assertSame('vid-3', $playback['video_id']);
        $this->assertSame(
            'https://'.VideoTokenService::EMBED_HOST."/embed/4242/vid-3?token={$token}&expires={$expires}",
            $playback['embed_url'],
        );
    }

    public function test_playback_embed_does_not_use_the_preview_lifetime_and_the_preview_keeps_its_own(): void
    {
        $playback = $this->service->signedPlayback($this->lesson('vid-3'), $this->user(17));
        $preview = $this->service->signedEmbedUrl($this->lesson('vid-3'));

        $this->assertSame(self::NOW + VideoTokenService::CDN_TTL_SECONDS, $playback['embed_expires_at']);
        $this->assertSame(self::NOW + VideoTokenService::EMBED_TTL_SECONDS, $preview['expires_at']);
        $this->assertNotSame($playback['embed_expires_at'], $preview['expires_at']);
        $this->assertStringStartsWith('https://'.VideoTokenService::EMBED_HOST.'/embed/', $preview['url']);
    }

    #[DataProvider('missingVideoIds')]
    public function test_playback_refuses_a_lesson_without_a_video(?string $videoId): void
    {
        $this->expectException(RuntimeException::class);

        $this->service->signedPlayback($this->lesson($videoId), $this->user(17));
    }

    #[DataProvider('missingVideoIds')]
    public function test_signing_refuses_a_lesson_without_a_video(?string $videoId): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Lesson has no Bunny video assigned.');

        $this->service->signedCdnUrl($this->lesson($videoId), $this->user(17));
    }

    #[DataProvider('missingVideoIds')]
    public function test_embed_signing_refuses_a_lesson_without_a_video(?string $videoId): void
    {
        $this->expectException(RuntimeException::class);

        $this->service->signedEmbedUrl($this->lesson($videoId));
    }

    /** @return array<string, array{?string}> */
    public static function missingVideoIds(): array
    {
        return ['null' => [null], 'empty string' => ['']];
    }

    public function test_cdn_url_keeps_the_documented_signature_for_a_conforming_id(): void
    {
        $signed = $this->service->signedCdnUrl($this->lesson('mock-etap-1-3'), $this->user(17));

        $expires = self::NOW + VideoTokenService::CDN_TTL_SECONDS;
        $viewer = substr(hash_hmac('sha256', 'video-viewer:17', 'test-security-key'), 0, 16);
        $message = '/mock-etap-1-3/'.$expires.'token_path=/mock-etap-1-3/&viewer='.$viewer;
        $digest = hash_hmac('sha256', $message, 'test-security-key', true);
        $token = 'HS256-'.rtrim(strtr(base64_encode($digest), '+/', '-_'), '=');

        $this->assertSame(
            "https://cdn.example.test/bcdn_token={$token}&token_path=%2Fmock-etap-1-3%2F&viewer={$viewer}&expires={$expires}/mock-etap-1-3/playlist.m3u8",
            $signed['url'],
        );
    }

    #[DataProvider('idsOutsideThePattern')]
    public function test_cdn_signing_refuses_an_id_outside_the_pattern(string $videoId): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Lesson has no Bunny video assigned.');

        $this->service->signedCdnUrl($this->lesson($videoId), $this->user(17));
    }

    #[DataProvider('idsOutsideThePattern')]
    public function test_embed_signing_refuses_an_id_outside_the_pattern(string $videoId): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Lesson has no Bunny video assigned.');

        $this->service->signedEmbedUrl($this->lesson($videoId));
    }

    #[DataProvider('idsOutsideThePattern')]
    public function test_a_lesson_with_an_id_outside_the_pattern_has_no_recording(string $videoId): void
    {
        $this->assertFalse($this->service->hasRecording($this->lesson($videoId)));
    }

    public function test_a_lesson_has_a_recording_only_for_a_conforming_id(): void
    {
        $this->assertTrue($this->service->hasRecording($this->lesson('mock-etap-1-3')));
        $this->assertFalse($this->service->hasRecording($this->lesson(null)));
        $this->assertFalse($this->service->hasRecording($this->lesson('')));
    }

    /** @return array<string, array{string}> */
    public static function idsOutsideThePattern(): array
    {
        return [
            'path into another library' => ['../../library/0/videos/x'],
            'parent directory' => ['../x'],
            'slash' => ['a/b'],
            'question mark' => ['x?y=1'],
            'percent-encoded dots' => ['%2e%2e'],
            'sixty five characters' => [str_repeat('a', 65)],
        ];
    }

    private function lesson(?string $videoId): Lesson
    {
        return new Lesson(['video_provider_id' => $videoId]);
    }

    private function user(int $id): User
    {
        return (new User)->forceFill(['id' => $id]);
    }

    private function tokenOf(string $url): string
    {
        preg_match('/bcdn_token=([^&]+)/', $url, $match);

        return $match[1];
    }
}
