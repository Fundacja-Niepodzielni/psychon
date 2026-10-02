<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * Jedyne miejsce, w którym schemat adresów aplikacji (`https` albo `http`) jest
 * ustalany z konfiguracji, a nie z żądania.
 *
 * Aplikacja stoi za pośrednikami kończącymi TLS (Cloudflare, Caddy, nginx obrazu),
 * które przekazują żądanie zwykłym HTTP, więc samo żądanie nie niesie schematu,
 * którym klient je wysłał. Gdy `APP_URL` zaczyna się od `https://`, aplikacja
 * traktuje każde żądanie jako HTTPS: generator adresów buduje linki z `https`
 * (`URL::forceScheme`), a żądanie jest oznaczone jako HTTPS, więc sprawdzanie
 * podpisu liczy ten sam adres, który został podpisany.
 *
 * Żaden nagłówek pośrednika (`X-Forwarded-*`, `Forwarded`, `CF-*`) nie jest tu
 * ani nigdzie indziej zaufany — ani do schematu, ani do hosta, portu czy adresu
 * klienta. Gdy `APP_URL` to `http://` (lokalnie, testy), niczego nie zmieniamy.
 */
class SchemeFromConfiguredUrl
{
    public function handle(Request $request, Closure $next): Response
    {
        if (str_starts_with(strtolower((string) config('app.url')), 'https://')) {
            URL::forceScheme('https');
            $request->server->set('HTTPS', 'on');
        }

        return $next($request);
    }
}
