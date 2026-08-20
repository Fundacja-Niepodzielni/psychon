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
