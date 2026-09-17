<?php

/*
|--------------------------------------------------------------------------
| Pakiet H22 · Dokumenty prawne z wersjami
|--------------------------------------------------------------------------
| Trasy pakietu dokumentów prawnych; zmiany tylko w obrębie tego pakietu.
| Registered inside the /api/v1 group.
|
| Trasy `legal-documents/{type}/current` i `.../versions/{version}` są
| publiczne — przepuszczone przez bramkę CI autoryzacji, wzorce dopisane
| w config/public_routes.php (odczyt bieżącej wersji i odczyt konkretnej
| wersji rodzaju dokumentu).
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h22')
*/

use App\Http\Controllers\Api\V1\H22\AdminLegalDocumentController;
use App\Http\Controllers\Api\V1\H22\LegalDocumentController;
use Illuminate\Support\Facades\Route;

if (! config('features.h22')) {
    return;
}

// Publiczne: bieżąca wersja rodzaju i konkretna wersja (odnośniki z historii
// zgód). Nieznany rodzaj / wersja / szkic → 404 (LegalDocumentController).
Route::get('/legal-documents/{type}/current', [LegalDocumentController::class, 'current']);
Route::get('/legal-documents/{type}/versions/{version}', [LegalDocumentController::class, 'show']);

// Zalogowana osoba: akceptacja bieżącej wersji. Bez `access.active` — dostęp
// wygasły do materiałów nie blokuje zgody na regulamin/politykę; o blokadzie
// innych tras decyduje ekran, nie ta trasa.
Route::middleware('auth:keycloak')->post('/legal-documents/{type}/accept', [LegalDocumentController::class, 'accept']);

// Administracja: lista wersji, szkic, publikacja, edycja/usunięcie szkicu.
Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/legal-documents/{type}/versions', [AdminLegalDocumentController::class, 'index']);
    Route::post('/admin/legal-documents/{type}/versions', [AdminLegalDocumentController::class, 'store']);
    Route::patch('/admin/legal-documents/{type}/versions/{version}', [AdminLegalDocumentController::class, 'update']);
    Route::delete('/admin/legal-documents/{type}/versions/{version}', [AdminLegalDocumentController::class, 'destroy']);
    Route::post('/admin/legal-documents/{type}/versions/{version}/publish', [AdminLegalDocumentController::class, 'publish']);
});
