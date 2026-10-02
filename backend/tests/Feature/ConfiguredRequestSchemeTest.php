<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\URL;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * Schemat adresów budowanych i sprawdzanych przez aplikację (podpisane linki
 * pobrania) pochodzi wyłącznie z `config('app.url')`. Aplikacja stoi za
 * pośrednikami, które kończą TLS i przekazują żądanie zwykłym HTTP; żaden
 * nagłówek pośrednika (`X-Forwarded-*`, `Forwarded`, `CF-*`) nie jest zaufany —
 * ani do schematu, ani do hosta, portu czy adresu klienta.
 */
class ConfiguredRequestSchemeTest extends TestCase
{
    use RefreshDatabase;

    private const HOST = 'platforma.psychon.test';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        Route::get('/schemat-sonda', fn (Request $request) => response()->json([
            'ip' => $request->ip(),
            'ips' => $request->ips(),
            'host' => $request->getHost(),
            'port' => $request->getPort(),
            'scheme' => $request->getScheme(),
            'secure' => $request->secure(),
            'url' => $request->url(),
            'root' => url('/'),
            'base' => $request->getBaseUrl(),
            'signed' => URL::temporarySignedRoute('schemat.podpis', now()->addMinutes(5), ['x' => 1]),
        ]));
        Route::get('/schemat-podpis', fn () => response('ok'))->name('schemat.podpis')->middleware('signed');
        Route::getRoutes()->refreshNameLookups();
    }

    public function test_https_app_url_gives_https_links_that_pass_the_signature_check_without_any_proxy_header(): void
    {
        config(['app.url' => 'https://'.self::HOST]);
        $this->actingAs($this->marta(), 'keycloak');

        // Żądanie dociera do aplikacji zwykłym HTTP z adresu publicznego, bez nagłówków.
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9']);

        $documentLink = $this->documentLink();
        $this->assertSame('https://'.self::HOST, $this->origin($documentLink));
        $this->assertSame('https://'.self::HOST, $this->origin($this->materialLink()));

        $this->get('http://'.substr($documentLink, strlen('https://')))
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_https_app_url_signature_is_not_tied_to_the_request_scheme_it_arrived_with(): void
    {
        config(['app.url' => 'https://'.self::HOST]);

        $link = $this->probe('203.0.113.9')['signed'];
        $this->assertStringStartsWith('https://'.self::HOST.'/schemat-podpis?', $link);
        $path = substr($link, strlen('https://'.self::HOST));

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])->get('http://'.self::HOST.$path)->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])->get('https://'.self::HOST.$path)->assertOk();
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function remoteAddressesAndConfiguredUrls(): array
    {
        $remotes = [
            'adres pośrednika w sieci Dockera' => '172.18.0.5',
            'adres prywatny 10/8' => '10.1.2.3',
            'pętla zwrotna' => '127.0.0.1',
            'adres publiczny' => '203.0.113.9',
            'pętla zwrotna v6' => '::1',
        ];
        $cases = [];
        foreach (['http' => 'http://'.self::HOST, 'https' => 'https://'.self::HOST] as $label => $appUrl) {
            foreach ($remotes as $name => $remote) {
                $cases["{$label}, {$name}"] = [$appUrl, $remote];
            }
        }

        return $cases;
    }

    #[DataProvider('remoteAddressesAndConfiguredUrls')]
    public function test_proxy_headers_change_neither_scheme_host_port_nor_client_address(string $appUrl, string $remote): void
    {
        config(['app.url' => $appUrl]);
        $scheme = str_starts_with($appUrl, 'https://') ? 'https' : 'http';
        $port = $scheme === 'https' ? 443 : 80;

        $withoutHeaders = $this->probe($remote);
        $this->assertSame($scheme, $withoutHeaders['scheme']);
        $this->assertSame($remote, $withoutHeaders['ip']);

        foreach ($this->proxyHeaderSets() as $label => $headers) {
            $seen = $this->probe($remote, $headers);

            $this->assertSame($scheme, $seen['scheme'], "schemat ({$label})");
            $this->assertSame($scheme === 'https', $seen['secure'], "secure ({$label})");
            $this->assertSame(self::HOST, $seen['host'], "host ({$label})");
            $this->assertSame($port, $seen['port'], "port ({$label})");
            $this->assertSame($remote, $seen['ip'], "ip ({$label})");
            $this->assertSame([$remote], $seen['ips'], "ips ({$label})");
            $this->assertSame('', $seen['base'], "prefiks ({$label})");
            $this->assertSame($scheme.'://'.self::HOST.'/schemat-sonda', $seen['url'], "adres żądania ({$label})");
            $this->assertSame($scheme.'://'.self::HOST, $seen['root'], "korzeń adresów ({$label})");
            $this->assertStringStartsWith($scheme.'://'.self::HOST.'/schemat-podpis?', $seen['signed'], "link ({$label})");
        }
    }

    public function test_http_app_url_keeps_the_scheme_of_the_request_itself(): void
    {
        config(['app.url' => 'http://'.self::HOST]);
        $this->actingAs($this->marta(), 'keycloak');

        $this->assertSame('http://'.self::HOST, $this->origin($this->documentLink()));
        $this->assertSame('http://'.self::HOST, $this->origin($this->materialLink()));

        $direct = $this->probe('203.0.113.9', [], 'https://'.self::HOST.'/schemat-sonda');
        $this->assertSame('https', $direct['scheme']);
        $this->assertSame('https://'.self::HOST, $direct['root']);
    }

    public function test_http_app_url_signed_link_from_a_plain_http_request_downloads_as_before(): void
    {
        config(['app.url' => 'http://'.self::HOST]);
        $this->actingAs($this->marta(), 'keycloak');

        $this->get($this->documentLink())
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function proxyHeaderSets(): array
    {
        return [
            'proto https' => ['X-Forwarded-Proto' => 'https'],
            'proto http' => ['X-Forwarded-Proto' => 'http'],
            'host' => ['X-Forwarded-Host' => 'zly.example'],
            'port' => ['X-Forwarded-Port' => '8443'],
            'for' => ['X-Forwarded-For' => '198.51.100.23'],
            'prefix' => ['X-Forwarded-Prefix' => '/zly'],
            'forwarded' => ['Forwarded' => 'for=198.51.100.24;host=zly2.example;proto=https'],
            'cloudflare' => ['CF-Connecting-IP' => '198.51.100.25', 'CF-Visitor' => '{"scheme":"https"}', 'CF-IPCountry' => 'PL'],
            'wszystkie' => [
                'X-Forwarded-Proto' => 'https',
                'X-Forwarded-Host' => 'zly.example',
                'X-Forwarded-Port' => '8443',
                'X-Forwarded-For' => '198.51.100.23',
                'X-Forwarded-Prefix' => '/zly',
                'Forwarded' => 'for=198.51.100.24;host=zly2.example;proto=https',
                'CF-Connecting-IP' => '198.51.100.25',
                'CF-Visitor' => '{"scheme":"https"}',
            ],
        ];
    }

    /**
     * @param  array<string, string>  $headers
     * @return array<string, mixed>
     */
    private function probe(string $remote, array $headers = [], string $url = 'http://'.self::HOST.'/schemat-sonda'): array
    {
        $this->flushHeaders();

        $json = $this->withServerVariables(['REMOTE_ADDR' => $remote])->withHeaders($headers)->getJson($url)->assertOk()->json();
        $this->assertIsArray($json);

        return $json;
    }

    private function marta(): User
    {
        return User::where('email', 'marta@demo.pl')->firstOrFail();
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
