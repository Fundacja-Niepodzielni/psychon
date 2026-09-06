<?php

use App\Http\Controllers\Api\V1\Admin\AccessController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H04 · Dostęp czasowy
|--------------------------------------------------------------------------
| Routes owned by team H04 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| The `access.active` middleware itself (skeleton in the starter) is attached
| by EACH package to its own content routes — see EnsureAccessActive. H04
| does not gate other packages' routes here; it only ships the middleware,
| the extension endpoint below, and the shared enforcement test suite.
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h04')
*/

if (! config('features.h04')) {
    return;
}

Route::middleware(['auth:sanctum', 'role:project_manager,super_admin'])
    ->post('/admin/users/{id}/extend-access', [AccessController::class, 'extend'])
    ->whereNumber('id');
