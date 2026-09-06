<?php

/*
|--------------------------------------------------------------------------
| Pakiet H18 · Panel — osoby i karta osoby
|--------------------------------------------------------------------------
| Routes owned by team H18 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h18')
*/

use App\Http\Controllers\Api\V1\Admin\AdminUserController;
use Illuminate\Support\Facades\Route;

if (! config('features.h18')) {
    return;
}

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/users/export.csv', [AdminUserController::class, 'export']);
    Route::get('/admin/users', [AdminUserController::class, 'index']);
    Route::post('/admin/users', [AdminUserController::class, 'store']);
    Route::get('/admin/users/{id}', [AdminUserController::class, 'show'])->whereNumber('id');
    Route::patch('/admin/users/{id}', [AdminUserController::class, 'update'])->whereNumber('id');
    Route::post('/admin/users/{id}/block', [AdminUserController::class, 'block'])->whereNumber('id');
});
