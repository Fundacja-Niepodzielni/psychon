<?php

use App\Http\Controllers\Api\V1\ProfileController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H01 · Profil użytkownika i eksport RODO
|--------------------------------------------------------------------------
| Routes owned by team H01 — other teams must not edit this file (§5.1).
| Registered inside the /api/v1 group; loaded AFTER routes/api/auth.php,
| so the GET /me below replaces the starter's placeholder MeController.
|
| No `access.active` middleware here on purpose: profile + RODO export must
| stay reachable after access expires (H04 keeps them on its exception list).
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h01')
*/

if (! config('features.h01')) {
    return;
}

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/me', [ProfileController::class, 'show']);
    Route::patch('/me', [ProfileController::class, 'update']);

    Route::post('/me/exports', [ProfileController::class, 'storeExport']);
    Route::get('/me/exports/{export}', [ProfileController::class, 'showExport']);
    Route::get('/me/exports/{export}/download', [ProfileController::class, 'downloadExport']);
});
