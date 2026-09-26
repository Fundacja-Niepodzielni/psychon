<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Nagłówki bezpieczeństwa każdej odpowiedzi API (OWASP Cheat Sheet „HTTP
 * Headers”, „REST Security”). Odpowiedzi niosą dane osobowe (profil, PESEL,
 * skany dyplomów, eksporty), więc żadna nie trafia do pamięci podręcznej,
 * a przeglądarka nie zgaduje typu treści i nie osadza jej w ramce.
 *
 * Przegląd ASVS: `docs/bezpieczenstwo/przeglad-asvs-dane.md`, wiersze V8.1.1,
 * V8.2.1, V14.4.3, V14.4.4, V14.4.5, V14.4.6, V14.4.7.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        if (! $request->is('api/*')) {
            return $response;
        }

        $response->headers->set('Cache-Control', 'no-store, private');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        $response->headers->set(
            'Content-Security-Policy',
            // Pliki (PDF, skany) otwiera przeglądarka, więc ich treści nie
            // blokujemy — zakaz osadzania obowiązuje wszystkie odpowiedzi.
            $response instanceof JsonResponse
                ? "default-src 'none'; frame-ancestors 'none'"
                : "frame-ancestors 'none'",
        );

        return $response;
    }
}
