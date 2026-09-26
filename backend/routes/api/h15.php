<?php

/*
|--------------------------------------------------------------------------
| Pakiet H15 · Profil psychologa
|--------------------------------------------------------------------------
| Routes owned by team H15 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:keycloak', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h15')
*/

use App\Http\Controllers\Api\V1\H15\AdminProfileController;
use App\Http\Controllers\Api\V1\H15\PsychologistProfileController;
use Illuminate\Support\Facades\Route;

if (! config('features.h15')) {
    return;
}

Route::middleware(['auth:keycloak', 'access.active', 'role:volunteer'])->group(function (): void {
    Route::get('/psychologist-profile', [PsychologistProfileController::class, 'index']);
    Route::patch('/psychologist-profile', [PsychologistProfileController::class, 'update']);
    Route::post('/psychologist-profile/submit', [PsychologistProfileController::class, 'submit']);
    // Limit wgrań na osobę (przegląd ASVS, wiersz V8.1.4).
    Route::post('/psychologist-profile/documents', [PsychologistProfileController::class, 'storeDocument'])
        ->middleware('throttle:20,1');
    Route::post('/psychologist-profile/consent/withdraw', [PsychologistProfileController::class, 'withdrawConsent']);
});

Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/profiles', [AdminProfileController::class, 'index']);
    Route::get('/admin/profiles/{id}', [AdminProfileController::class, 'show'])->whereNumber('id');
    Route::post('/admin/profiles/{id}/accept', [AdminProfileController::class, 'accept'])->whereNumber('id');
    Route::post('/admin/profiles/{id}/return', [AdminProfileController::class, 'return'])->whereNumber('id');
    Route::get('/admin/profiles/{profileId}/documents/{docId}', [AdminProfileController::class, 'downloadDocument'])
        ->whereNumber('profileId')
        ->whereNumber('docId')
        ->middleware('signed')
        ->name('admin.profiles.documents.download');
});
