<?php

/*
|--------------------------------------------------------------------------
| Pakiet H08 · CMS treści
|--------------------------------------------------------------------------
| Routes owned by team H08 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h08')
*/

use App\Http\Controllers\Api\V1\Admin\CourseCatalogAdminController;
use App\Http\Controllers\Api\V1\Admin\CourseInviteController;
use App\Http\Controllers\Api\V1\Admin\CourseSequenceController;
use App\Http\Controllers\Api\V1\Admin\LessonAdminController;
use App\Http\Controllers\Api\V1\Admin\MaterialAdminController;
use Illuminate\Support\Facades\Route;

if (! config('features.h08')) {
    return;
}

// Bez `access.active` — administracja nie podlega wygaśnięciu dostępu do programu.
Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/courses', [CourseCatalogAdminController::class, 'index']);
    Route::post('/admin/courses', [CourseCatalogAdminController::class, 'store']);
    Route::get('/admin/courses/{course}', [CourseCatalogAdminController::class, 'show'])->whereNumber('course');
    Route::patch('/admin/courses/{course}', [CourseCatalogAdminController::class, 'update'])->whereNumber('course');
    Route::delete('/admin/courses/{course}', [CourseCatalogAdminController::class, 'destroy'])->whereNumber('course');

    // Płaski prefiks `/admin/lessons/{id}` dla edycji i usunięcia jest spójny
    // z `POST /admin/lessons/{id}/materials` z karty pakietu (H08b).
    Route::get('/admin/courses/{course}/lessons', [LessonAdminController::class, 'index'])->whereNumber('course');
    Route::post('/admin/courses/{course}/lessons', [LessonAdminController::class, 'store'])->whereNumber('course');
    Route::patch('/admin/lessons/{lesson}', [LessonAdminController::class, 'update'])->whereNumber('lesson');
    Route::delete('/admin/lessons/{lesson}', [LessonAdminController::class, 'destroy'])->whereNumber('lesson');

    // `PATCH .../reorder` to legalny wyjątek nazewniczy wymieniony w kontrakcie §1.
    // Literalny segment `reorder` nie zostanie przechwycony przez
    // `PATCH /admin/courses/{course}`, bo tamta trasa ma `whereNumber('course')`.
    Route::patch('/admin/courses/reorder', [CourseSequenceController::class, 'reorderCourses']);
    Route::post('/admin/courses/reorder/preview', [CourseSequenceController::class, 'preview']);
    Route::patch('/admin/courses/{course}/lessons/reorder', [CourseSequenceController::class, 'reorderLessons'])->whereNumber('course');

    // H08b · materiały. Pobranie NIE jest tutaj: `GET /materials/{material}/download`
    // dowiózł H05 (podpisany link, re-sprawdzanie dostępu w chwili pobrania).
    Route::post('/admin/lessons/{lesson}/materials', [MaterialAdminController::class, 'storeForLesson'])->whereNumber('lesson');
    Route::post('/admin/courses/{course}/materials', [MaterialAdminController::class, 'storeForCourse'])->whereNumber('course');
    Route::delete('/admin/materials/{material}', [MaterialAdminController::class, 'destroy'])->whereNumber('material');

    // H08b · zaproszenia. Zapraszamy wyłącznie na kursy poza główną ścieżką
    // (M4 pkt 6) — regułę trzyma `CourseInviter`, trasa jest zwykłą akcją
    // domenową na pod-zasobie.
    Route::post('/admin/courses/{course}/invite', [CourseInviteController::class, 'invite'])->whereNumber('course');
});
