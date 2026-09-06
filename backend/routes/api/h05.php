<?php

use App\Http\Controllers\Api\V1\CourseController;
use App\Http\Controllers\Api\V1\MaterialDownloadController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H05 · Katalog kursów i sekwencyjne odblokowanie
|--------------------------------------------------------------------------
| Routes owned by team H05 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h05')
*/

if (config('features.h05')) {
    Route::middleware(['auth:sanctum', 'access.active'])->group(function (): void {
        Route::get('/courses', [CourseController::class, 'index']);
        Route::get('/courses/{slug}', [CourseController::class, 'show']);
    });

    // Browser-initiated download: no Authorization header, so the temporary
    // signature carries the authorization instead. Whitelisted in
    // config/public_routes.php with the contract guardian's approval.
    Route::middleware('signed')
        ->get('/materials/{material}/download', MaterialDownloadController::class)
        ->name('materials.download');
}
