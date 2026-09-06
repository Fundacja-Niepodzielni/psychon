<?php

use App\Http\Controllers\Api\V1\H11\AdminInternshipController;
use App\Http\Controllers\Api\V1\H11\InternshipEntryController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H11 · Staż — dziennik i akceptacje
|--------------------------------------------------------------------------
| Routes owned by team H11 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h11')
*/

if (! config('features.h11')) {
    return;
}

Route::middleware(['auth:sanctum', 'access.active', 'role:volunteer'])->group(function (): void {
    Route::get('/internship/entries', [InternshipEntryController::class, 'index']);
    Route::post('/internship/entries', [InternshipEntryController::class, 'store']);
    Route::patch('/internship/entries/{id}', [InternshipEntryController::class, 'update'])
        ->whereNumber('id');
});

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/internship/pending', [AdminInternshipController::class, 'pending']);
    Route::post('/admin/internship/{id}/accept', [AdminInternshipController::class, 'accept'])
        ->whereNumber('id');
    Route::post('/admin/internship/{id}/return', [AdminInternshipController::class, 'return'])
        ->whereNumber('id');
});
