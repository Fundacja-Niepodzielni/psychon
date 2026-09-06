<?php

/*
|--------------------------------------------------------------------------
| Pakiet H19 · Panel — pulpit i ustawienia edycji
|--------------------------------------------------------------------------
| Routes owned by team H19 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h19')
*/

use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\EditionSettingsController;
use Illuminate\Support\Facades\Route;

if (! config('features.h19')) {
    return;
}

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/dashboard', [DashboardController::class, 'show']);
    Route::get('/admin/edition', [EditionSettingsController::class, 'show']);
    Route::patch('/admin/edition', [EditionSettingsController::class, 'update']);
});
