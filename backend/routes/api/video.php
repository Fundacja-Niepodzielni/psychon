<?php

use App\Http\Controllers\Api\V1\Admin\BunnyVideoAdminController;
use App\Http\Controllers\Api\V1\VideoTokenController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Nagrania lekcji — Bunny Stream
|--------------------------------------------------------------------------
| Poza numeracją pakietów hXX — to osobna, przekrojowa grupa tras, nie
| jeden z pakietów hackathonu. Webhook Bunny NIE ISTNIEJE tu celowo: host
| deweloperski stoi za bramką dostępu, która odpowiada zewnętrznym
| żądaniom własnym przekierowaniem zamiast dopuścić je do aplikacji —
| webhook przenosi się dopiero razem z docelowym hostem.
*/

Route::middleware(['auth:keycloak', 'access.active'])
    ->get('/lessons/{lesson}/video-link', [VideoTokenController::class, 'show'])
    ->whereNumber('lesson');

Route::middleware(['auth:keycloak', 'role:super_admin'])
    ->post('/admin/lessons/{lesson}/video-uploads', [BunnyVideoAdminController::class, 'createUpload'])
    ->whereNumber('lesson');

Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])
    ->get('/admin/lessons/{lesson}/video-status', [BunnyVideoAdminController::class, 'status'])
    ->whereNumber('lesson');
