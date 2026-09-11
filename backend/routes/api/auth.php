<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\MeController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Auth (starter) — login, logout, password reset, account activation
|--------------------------------------------------------------------------
| Public routes are listed in config/public_routes.php — the authorization
| smoke test enforces that everything else requires auth.
*/

Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])
    ->middleware('throttle:6,1');
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])
    ->middleware('throttle:6,1');
Route::post('/auth/activate', [AuthController::class, 'activate'])
    ->middleware('throttle:6,1');

// Logout revokes the CURRENT Sanctum token — it stays Sanctum-only on
// purpose: `AuthController::logout()` calls `currentAccessToken()`, which a
// keycloak-guard-resolved user never has. A Keycloak session ends through
// Konta Niepodzielni's own end-session flow, not this route (frontend:
// `PanelShell`).
Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
});

// `/me` accepts either token type (criterion §3) — REWIRED here for when
// `features.h01` is off; `h01.php` overrides this route with the fuller
// profile shape when the flag is on.
Route::middleware('auth:sanctum,keycloak')->group(function (): void {
    Route::get('/me', MeController::class);
});
