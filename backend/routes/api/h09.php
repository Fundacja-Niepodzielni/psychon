<?php

/*
|--------------------------------------------------------------------------
| Pakiet H09 · Prowadzący — wizytówki i przypisania
|--------------------------------------------------------------------------
| Routes owned by team H09 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h09')
*/

use App\Http\Controllers\Api\V1\H09\CourseAssignmentController;
use App\Http\Controllers\Api\V1\H09\InstructorDirectoryController;
use App\Http\Controllers\Api\V1\H09\MyInstructorProfileController;
use Illuminate\Support\Facades\Route;

if (! config('features.h09')) {
    return;
}

// Wizytówki prowadzących — treść programowa, każda zalogowana rola, za aktywnym dostępem.
Route::middleware(['auth:sanctum', 'access.active'])->group(function (): void {
    Route::get('/instructors', [InstructorDirectoryController::class, 'index']);
    Route::get('/instructors/{id}', [InstructorDirectoryController::class, 'show'])
        ->whereNumber('id');
});

// Własna wizytówka prowadzącego i jego kursy.
Route::middleware(['auth:sanctum', 'role:instructor'])->group(function (): void {
    Route::get('/me/instructor-profile', [MyInstructorProfileController::class, 'show']);
    Route::patch('/me/instructor-profile', [MyInstructorProfileController::class, 'update']);
    Route::get('/instructor/courses', [MyInstructorProfileController::class, 'courses']);
});

// Przypisania prowadzących do kursów i lekcji — wyłącznie administracja.
Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/courses/{course}/assignments', [CourseAssignmentController::class, 'index'])
        ->whereNumber('course');
    Route::post('/admin/courses/{course}/assignments', [CourseAssignmentController::class, 'store'])
        ->whereNumber('course');
    Route::delete('/admin/courses/{course}/assignments', [CourseAssignmentController::class, 'destroy'])
        ->whereNumber('course');
});
