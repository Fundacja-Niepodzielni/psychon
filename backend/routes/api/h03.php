<?php

/*
|--------------------------------------------------------------------------
| Pakiet H03 · Rekrutacja — kolejka zgłoszeń
|--------------------------------------------------------------------------
| Routes owned by team H03 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:keycloak', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h03')
*/

use App\Http\Controllers\Api\V1\Admin\ApplicationController;
use App\Http\Controllers\Api\V1\H03\ApplicationFirstLoginController;
use Illuminate\Support\Facades\Route;

if (! config('features.h03')) {
    return;
}

// Pierwsze logowanie z przyjętego zgłoszenia: wiązanie `sub` po potwierdzonym
// adresie e-mail. Middleware tokena (nie strażnik), jak `/sso/powiaz`.
Route::middleware(['auth.keycloak', 'throttle:6,1'])
    ->post('/applications/first-login', ApplicationFirstLoginController::class);

Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/applications', [ApplicationController::class, 'index']);
    Route::post('/admin/applications', [ApplicationController::class, 'store']);
    Route::get('/admin/applications/{id}', [ApplicationController::class, 'show'])->whereNumber('id');
    Route::post('/admin/applications/{id}/accept', [ApplicationController::class, 'accept'])->whereNumber('id');
    Route::post('/admin/applications/{id}/reject', [ApplicationController::class, 'reject'])->whereNumber('id');
    Route::post('/admin/applications/import', [ApplicationController::class, 'import']);
    Route::get('/admin/applications/{id}/diploma-scan', [ApplicationController::class, 'diplomaScan'])->whereNumber('id');
});
