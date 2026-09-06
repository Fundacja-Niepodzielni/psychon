<?php

/*
|--------------------------------------------------------------------------
| Pakiet H14 · Dokumenty generowane z profilu
|--------------------------------------------------------------------------
| Routes owned by team H14 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h14')
*/

use App\Http\Controllers\Api\V1\DocumentController;
use Illuminate\Support\Facades\Route;

if (config('features.h14')) {
    Route::middleware(['auth:sanctum', 'access.active'])->group(function (): void {
        Route::get('/documents', [DocumentController::class, 'index']);
        Route::post('/documents/generate', [DocumentController::class, 'generate']);
        Route::get('/documents/{document}/download', [DocumentController::class, 'download'])
            ->middleware('signed')
            ->name('documents.download');
    });
}
