<?php

use App\Http\Controllers\Api\V1\Admin\EmailController;
use App\Http\Controllers\Api\V1\NotificationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H16 · Powiadomienia — dzwonek + e-maile symulowane
|--------------------------------------------------------------------------
| Routes owned by team H16 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h16')
*/

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'readAll']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'read'])
        ->whereNumber('id');

    Route::middleware('role:project_manager,super_admin')
        ->get('/admin/emails', [EmailController::class, 'index']);
});
