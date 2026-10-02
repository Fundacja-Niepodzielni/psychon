<?php

use App\Http\Controllers\Api\V1\Admin\BunnyVideoAdminController;
use App\Http\Controllers\Api\V1\H08\InstructorVideoController;
use App\Http\Controllers\Api\V1\VideoTokenController;
use App\Providers\AppServiceProvider;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Nagrania lekcji — Bunny Stream
|--------------------------------------------------------------------------
| Poza numeracją pakietów hXX — to osobna, przekrojowa grupa tras, nie
| jeden z pakietów hackathonu. Ten plik definiuje wyłącznie pięć tras:
| wydanie linku do nagrania, dwie trasy administracyjne (zlecenie
| przesyłki, odczyt stanu) i te same dwie trasy dla prowadzącego
| przypisanego do kursu lekcji. Trasy odbierającej webhook Bunny tu nie
| ma — żadnego kontrolera ani wpisu w tym pliku dla niej nie przygotowano.
*/

Route::middleware(['auth:keycloak', 'access.active'])
    ->get('/lessons/{lesson}/video-link', [VideoTokenController::class, 'show'])
    ->whereNumber('lesson');

// Zlecenie wgrania ma limit żądań (jedna definicja, `AppServiceProvider`, 10 na
// minutę na osobę) na obu trasach — administracji i prowadzącego. Kolejność jak na
// trasie zapisu wzoru dokumentu: brak tokenu (401) stoi przed limitem; odmowa roli
// (403) i odmowa zasięgu (404 w kontrolerze) stoją po nim i liczą się do limitu
// (priorytet pośredników Laravela stawia `throttle` przed aliasem `role`).
Route::middleware(['auth:keycloak', 'role:project_manager,super_admin', 'throttle:'.AppServiceProvider::RECORDING_UPLOADS_LIMITER])
    ->post('/admin/lessons/{lesson}/video-uploads', [BunnyVideoAdminController::class, 'createUpload'])
    ->whereNumber('lesson');

Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])
    ->get('/admin/lessons/{lesson}/video-status', [BunnyVideoAdminController::class, 'status'])
    ->whereNumber('lesson');

// Prowadzący: ten sam kod wgrania i odczytu stanu co trasy administracji,
// wyłącznie w lekcjach kursu z jego aktywnym przypisaniem na poziomie kursu.
// Parametr bez wiązania z modelem: lekcja obca i nieistniejąca dają to samo
// 404, przed ciałem żądania i przed konfiguracją dostawcy nagrań.
Route::middleware(['auth:keycloak', 'role:instructor', 'throttle:'.AppServiceProvider::RECORDING_UPLOADS_LIMITER])
    ->post('/instructor/lessons/{lesson}/video-uploads', [InstructorVideoController::class, 'createInstructorUpload'])
    ->whereNumber('lesson');

Route::middleware(['auth:keycloak', 'role:instructor'])
    ->get('/instructor/lessons/{lesson}/video-status', [InstructorVideoController::class, 'instructorStatus'])
    ->whereNumber('lesson');
