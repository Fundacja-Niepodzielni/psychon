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
