<?php

use App\Exceptions\ApiExceptionRenderer;
use App\Http\Middleware\EnsureAccessActive;
use App\Http\Middleware\EnsureRole;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => EnsureRole::class,           // role:project_manager,super_admin
            'access.active' => EnsureAccessActive::class, // blocks after access_expires_at
        ]);

        // Za pośrednikiem TLS (Caddy, Traefik) aplikacja dostaje żądania zwykłym
        // HTTP. Schemat pierwotnego żądania przyjmujemy z `X-Forwarded-Proto`
        // wyłącznie od pośrednika z sieci prywatnej, żeby adresy budowane przez
        // aplikację (podpisane linki pobrania) miały schemat, którym przyszło
        // żądanie. Pozostałe nagłówki `X-Forwarded-*` nie są brane pod uwagę.
        $middleware->trustProxies(
            at: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1', 'fc00::/7'],
            headers: Request::HEADER_X_FORWARDED_PROTO,
        );

        // API nie ma strony logowania — goście dostają JSON 401 zamiast
        // przekierowania do nieistniejącej trasy "login" (500 przy żądaniach bez Accept).
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*') ? null : '/',
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // The only allowed error envelope for the API (contract §1).
        $exceptions->render(
            fn (Throwable $e, Request $request) => ApiExceptionRenderer::handle($e, $request),
        );
    })->create();
