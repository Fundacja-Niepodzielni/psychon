<?php

/*
|--------------------------------------------------------------------------
| Pakiet H07 · Pomiar czasu nauki i rzetelność
|--------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\V1\H07\ReliabilityController;
use Illuminate\Support\Facades\Route;

if (! config('features.h07')) {
    return;
}

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/reliability', [ReliabilityController::class, 'adminIndex']);
    Route::get('/admin/reliability/{userId}', [ReliabilityController::class, 'adminShow'])
        ->whereNumber('userId');
});

Route::middleware(['auth:sanctum', 'role:instructor'])->group(function (): void {
    Route::get('/instructor/reliability', [ReliabilityController::class, 'instructorIndex']);
});
