<?php

/*
|--------------------------------------------------------------------------
| Pakiet H12 · Superwizja — terminy, zapisy, obecności
|--------------------------------------------------------------------------
| Routes owned by team H12 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h12')
*/

use App\Http\Controllers\Api\V1\H12\AdminSupervisionController;
use App\Http\Controllers\Api\V1\H12\InstructorSupervisionController;
use App\Http\Controllers\Api\V1\H12\ParticipantSupervisionController;
use Illuminate\Support\Facades\Route;

if (! config('features.h12')) {
    return;
}

Route::middleware(['auth:sanctum', 'access.active', 'role:volunteer'])->group(function (): void {
    Route::get('/supervision/slots', [ParticipantSupervisionController::class, 'index']);
    Route::post('/supervision/slots/{id}/signup', [ParticipantSupervisionController::class, 'signup'])
        ->whereNumber('id');
    Route::delete('/supervision/slots/{id}/signup', [ParticipantSupervisionController::class, 'cancel'])
        ->whereNumber('id');
});

Route::middleware(['auth:sanctum', 'role:instructor'])->group(function (): void {
    Route::get('/instructor/group', [InstructorSupervisionController::class, 'group']);
    Route::post('/instructor/slots', [InstructorSupervisionController::class, 'storeSlot']);
});

Route::middleware(['auth:sanctum', 'role:instructor,project_manager,super_admin'])->group(function (): void {
    Route::patch('/instructor/slots/{id}/attendance', [InstructorSupervisionController::class, 'attendance'])
        ->whereNumber('id');
});

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::put('/admin/users/{id}/supervisor', [AdminSupervisionController::class, 'assignSupervisor'])
        ->whereNumber('id');
});
