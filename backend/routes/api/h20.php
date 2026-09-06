<?php

use App\Http\Controllers\Api\V1\Admin\AuditController;
use App\Http\Controllers\Api\V1\Admin\ReportController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H20 · Raporty i widoki dziennika działań
|--------------------------------------------------------------------------
| Routes owned by team H20 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Zero mutation routes for /admin/audit on purpose (contract §2: „trasy
| modyfikacji audytu nie istnieją" — a PATCH/DELETE attempt just 404s,
| there is nothing here to catch it).
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h20')
*/

if (! config('features.h20')) {
    return;
}

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/report/export.csv', [ReportController::class, 'export']);
    Route::get('/admin/report', [ReportController::class, 'show']);

    Route::get('/admin/audit/export.csv', [AuditController::class, 'export']);
    Route::get('/admin/audit', [AuditController::class, 'index']);
});
