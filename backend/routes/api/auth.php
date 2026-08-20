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

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', MeController::class);
});
