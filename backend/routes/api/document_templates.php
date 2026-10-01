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
    // Zapis probnie generuje dokument (PDF) z zapisywanej tresci, wiec ma limit zadan:
    // 20 na minute na osobe - wielokrotnie wiecej niz reczna edycja, a gorna granica
    // kosztu generowania. Przekroczenie = 429 w standardowej kopercie bledu.
    Route::put('/document-templates/{type}', [DocumentTemplateController::class, 'update'])
        ->middleware('throttle:20,1');
    Route::get('/document-templates/{type}/versions', [DocumentTemplateController::class, 'versions']);
});
