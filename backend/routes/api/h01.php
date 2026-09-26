<?php

use App\Http\Controllers\Api\V1\H01\AdminCooperationRequestController;
use App\Http\Controllers\Api\V1\H01\CooperationRequestController;
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

Route::middleware('auth:keycloak')->group(function (): void {
    Route::get('/me', [ProfileController::class, 'show']);
    Route::patch('/me', [ProfileController::class, 'update']);

    // Limit żądań eksportu RODO: paczka jest kosztowna i zawiera komplet danych
    // osobowych, więc ponad limit odpowiadamy 429 (koperta w ApiExceptionRenderer).
    // Trwający eksport blokuje wcześniej — 409 `export_in_progress` w kontrolerze.
    Route::post('/me/exports', [ProfileController::class, 'storeExport'])
        ->middleware('throttle:'.config('exports.rate_limit'));
    Route::get('/me/exports/{export}', [ProfileController::class, 'showExport']);
    Route::get('/me/exports/{export}/download', [ProfileController::class, 'downloadExport']);

    // Zgłoszenie dalszej współpracy po zakończeniu programu. Bez
    // `access.active` z tego samego powodu co profil: po zakończeniu programu
    // dostęp do kursów może już wygasnąć, a zgłoszenie ma zostać osiągalne.
    Route::post('/cooperation-requests', [CooperationRequestController::class, 'store']);
    Route::get('/cooperation-requests/mine', [CooperationRequestController::class, 'mine']);

    Route::middleware('role:project_manager,super_admin')->group(function (): void {
        Route::get('/admin/cooperation-requests', [AdminCooperationRequestController::class, 'index']);
        Route::patch('/admin/cooperation-requests/{id}', [AdminCooperationRequestController::class, 'respond'])
            ->whereNumber('id');
    });
});
