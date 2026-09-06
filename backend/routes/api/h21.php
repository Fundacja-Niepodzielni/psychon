<?php

use App\Http\Controllers\Api\V1\OnboardingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H21 · Onboarding „Zacznij tutaj"
|--------------------------------------------------------------------------
| Routes owned by team H21 — other teams must not edit this file (§5.1).
| Registered inside the /api/v1 group.
|
| GET /onboarding has no `access.active` middleware on purpose: the screen
| must stay reachable after access expires and after the programme is
| finished (criterion 2, shared test with H04).
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h21')
*/

if (! config('features.h21')) {
    return;
}

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/onboarding', [OnboardingController::class, 'show']);

    Route::middleware('role:super_admin,project_manager')
        ->patch('/admin/onboarding', [OnboardingController::class, 'update']);
});
