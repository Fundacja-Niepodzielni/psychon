<?php

/*
|--------------------------------------------------------------------------
| Edytor wzorow dokumentow (zaplecze) - trasy administracji
|--------------------------------------------------------------------------
| Odczyt i edycja wzorow dokumentow generowanych z profilu (porozumienie,
| zaswiadczenie o stazu, certyfikat) oraz odczyt ich historii. Registered
| inside the /api/v1 group. Every route requires auth.
|
| Contract:
|   GET  /document-templates/{type}
|   PUT  /document-templates/{type}
|   GET  /document-templates/{type}/versions
| flag: config('features.document_templates')
*/

use App\Http\Controllers\Api\V1\DocumentTemplateController;
use Illuminate\Support\Facades\Route;

if (! config('features.document_templates')) {
    return;
}

Route::middleware(['auth:keycloak', 'access.active', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/document-templates/{type}', [DocumentTemplateController::class, 'show']);
    Route::put('/document-templates/{type}', [DocumentTemplateController::class, 'update']);
    Route::get('/document-templates/{type}/versions', [DocumentTemplateController::class, 'versions']);
});
