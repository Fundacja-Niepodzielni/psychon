<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * Żądania przychodzące przez pośrednika TLS w sieci prywatnej (Caddy, Traefik):
 * pośrednik łączy się z aplikacją zwykłym HTTP i podaje schemat pierwotnego
 * żądania w `X-Forwarded-Proto`. Adresy budowane przez aplikację — tu podpisane
 * linki pobrania dokumentu i materiału — mają mieć schemat, którym przyszło
 * pierwotne żądanie, i ten sam host, więc pochodzenie linku jest pochodzeniem API
 * widzianym przez przeglądarkę. Nagłówek od adresu spoza sieci prywatnej nie
 * zmienia niczego.
 */
class ProxiedRequestSchemeTest extends TestCase
{
    use RefreshDatabase;

    private const HOST = 'platforma.psychon.test';

    private const PROXY_ADDRESS = '172.18.0.5';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_links_behind_a_private_tls_proxy_carry_the_original_scheme_and_host(): void
    {
        $this->actingAs($this->marta(), 'keycloak');
        $this->viaProxy(self::PROXY_ADDRESS);

        $this->assertSame('https://'.self::HOST, $this->origin($this->documentLink()));
        $this->assertSame('https://'.self::HOST, $this->origin($this->materialLink()));
    }

    public function test_signed_document_link_from_a_proxied_response_downloads_through_the_proxy(): void
    {
        $this->actingAs($this->marta(), 'keycloak');
        $this->viaProxy(self::PROXY_ADDRESS);

        $link = $this->documentLink();
        $this->assertStringStartsWith('https://'.self::HOST.'/api/v1/documents/', $link);

        // Pośrednik przekazuje to samo żądanie dalej zwykłym HTTP.
        $this->get('http://'.substr($link, strlen('https://')))
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_forwarded_scheme_from_an_address_outside_private_networks_is_ignored(): void
    {
        $this->actingAs($this->marta(), 'keycloak');
        $this->viaProxy('203.0.113.9');

        $this->assertSame('http://'.self::HOST, $this->origin($this->documentLink()));
        $this->assertSame('http://'.self::HOST, $this->origin($this->materialLink()));
    }

    public function test_direct_request_without_a_proxy_keeps_its_own_scheme(): void
    {
        $this->actingAs($this->marta(), 'keycloak');

        $this->assertSame('http://'.self::HOST, $this->origin($this->documentLink()));
        $this->assertSame('http://'.self::HOST, $this->origin($this->materialLink()));
    }

    private function marta(): User
    {
        return User::where('email', 'marta@demo.pl')->firstOrFail();
    }

    private function viaProxy(string $remoteAddress): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => $remoteAddress])->withHeaders([
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-Host' => self::HOST,
            'X-Forwarded-For' => '198.51.100.23',
        ]);
    }

    private function documentLink(): string
    {
        return $this->link($this->getJson('http://'.self::HOST.'/api/v1/documents'), 'data.0.download_url');
    }

    private function materialLink(): string
    {
        $slug = Course::query()->orderBy('sequence_order')->firstOrFail()->slug;

        return $this->link($this->getJson('http://'.self::HOST.'/api/v1/courses/'.$slug), 'data.materials.0.download_url');
    }

    /**
     * @param  TestResponse<Response>  $response
     */
    private function link(TestResponse $response, string $path): string
    {
        $response->assertOk();
        $link = $response->json($path);
        $this->assertIsString($link);

        return $link;
    }

    private function origin(string $url): string
    {
        $parts = parse_url($url);
        $this->assertIsArray($parts);

        return ($parts['scheme'] ?? '').'://'.($parts['host'] ?? '').(isset($parts['port']) ? ':'.$parts['port'] : '');
    }
}
