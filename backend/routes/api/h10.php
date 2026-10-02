<?php

use App\Http\Controllers\Api\V1\AdminTestController;
use App\Http\Controllers\Api\V1\AdminTestQuestionController;
use App\Http\Controllers\Api\V1\AdminTestResetController;
use App\Http\Controllers\Api\V1\AdminWorkshopController;
use App\Http\Controllers\Api\V1\H10\InstructorTestController;
use App\Http\Controllers\Api\V1\H10\InstructorTestQuestionController;
use App\Http\Controllers\Api\V1\TestController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H10 · Testy wiedzy + warsztat
|--------------------------------------------------------------------------
| Routes owned by team H10 — other teams must not edit this file (§5.1).
| Registered inside the /api/v1 group.
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h10')
*/

if (! config('features.h10')) {
    return;
}

// Uczestnik: rozwiązywanie testu i historia własnych podejść.
// `access.active` — test to funkcja programu (blokowana po wygaśnięciu dostępu).
Route::middleware(['auth:keycloak', 'access.active', 'role:volunteer,student'])->group(function (): void {
    Route::get('/courses/{slug}/test', [TestController::class, 'show']);
    Route::post('/tests/{test}/attempts', [TestController::class, 'storeAttempt']);
    Route::get('/tests/{test}/attempts', [TestController::class, 'attempts']);
});

// Administracja: bank pytań, warsztat, reset limitu podejść.
Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/courses/{course}/tests', [AdminTestController::class, 'index']);
    Route::post('/admin/courses/{course}/tests', [AdminTestController::class, 'store']);
    Route::patch('/admin/tests/{test}', [AdminTestController::class, 'update']);

    Route::get('/admin/tests/{test}/questions', [AdminTestQuestionController::class, 'index']);
    Route::post('/admin/tests/{test}/questions', [AdminTestQuestionController::class, 'store']);
    Route::patch('/admin/questions/{question}', [AdminTestQuestionController::class, 'update']);
    Route::delete('/admin/questions/{question}', [AdminTestQuestionController::class, 'destroy']);

    Route::post('/admin/workshop/{user}/complete', [AdminWorkshopController::class, 'store']);
    Route::post('/admin/tests/{test}/users/{user}/reset-attempts', [AdminTestResetController::class, 'store']);
});

// Prowadzący: test wiedzy i jego bank pytań wyłącznie kursu, do którego jest
// przypisany. Test kursu (`InstructorTestController`) pilnuje `CoursePolicy`
// (cudzy kurs → 403); bank pytań (`InstructorTestQuestionController`) ma zasięg
// jak tematy kursu — test albo pytanie obce wygląda jak nieistniejące (404).
Route::middleware(['auth:keycloak', 'role:instructor'])->group(function (): void {
    Route::get('/instructor/courses/{course}/tests', [InstructorTestController::class, 'index'])->whereNumber('course');
    Route::post('/instructor/courses/{course}/tests', [InstructorTestController::class, 'store'])->whereNumber('course');
    Route::patch('/instructor/tests/{test}', [InstructorTestController::class, 'update'])->whereNumber('test');

    Route::get('/instructor/tests/{test}/questions', [InstructorTestQuestionController::class, 'index'])->whereNumber('test');
    Route::post('/instructor/tests/{test}/questions', [InstructorTestQuestionController::class, 'store'])->whereNumber('test');
    Route::patch('/instructor/questions/{question}', [InstructorTestQuestionController::class, 'update'])->whereNumber('question');
    Route::delete('/instructor/questions/{question}', [InstructorTestQuestionController::class, 'destroy'])->whereNumber('question');
});
