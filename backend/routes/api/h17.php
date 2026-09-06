<?php

/*
|--------------------------------------------------------------------------
| Pakiet H17 · Pytania do prowadzącego
|--------------------------------------------------------------------------
| Routes owned by team H17 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h17')
*/

use App\Http\Controllers\Api\V1\H17\InstructorQuestionController;
use App\Http\Controllers\Api\V1\H17\LessonQuestionController;
use Illuminate\Support\Facades\Route;

if (! config('features.h17')) {
    return;
}

Route::middleware(['auth:sanctum', 'access.active', 'role:volunteer,student'])->group(function (): void {
    Route::post('/lessons/{id}/questions', [LessonQuestionController::class, 'store'])
        ->whereNumber('id');

    // Extends contract §2 — the package card's acceptance criterion 3 („odpowiedź
    // widoczna przy lekcji u pytającego") has no carrier without it. Pending the
    // contract guardian's ruling; see DEMO/H17.md.
    Route::get('/lessons/{id}/questions', [LessonQuestionController::class, 'index'])
        ->whereNumber('id');
});

Route::middleware(['auth:sanctum', 'role:instructor'])->group(function (): void {
    Route::get('/instructor/questions', [InstructorQuestionController::class, 'index']);
    Route::post('/instructor/questions/{id}/answer', [InstructorQuestionController::class, 'answer'])
        ->whereNumber('id');
});
