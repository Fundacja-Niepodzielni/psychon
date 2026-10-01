<?php

use App\Http\Controllers\Api\V1\Admin\AdminCertificateController;
use App\Http\Controllers\Api\V1\CertificateController;
use App\Http\Controllers\Api\V1\VerifyController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Pakiet H13 · Certyfikaty + weryfikacja publiczna
|--------------------------------------------------------------------------
| Routes owned by team H13 — other teams must not edit this file (§5.1).
| Registered inside the /api/v1 group.
|
| Trasy `verify/*` są publiczne — już przepuszczone przez bramkę CI
| autoryzacji (config/public_routes.php: `api/v1/verify/*`).
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h13')
*/

if (! config('features.h13')) {
    return;
}

// Uczestnik: warunki, wydanie, pobranie własnego certyfikatu.
Route::middleware(['auth:keycloak', 'access.active', 'role:volunteer'])->group(function (): void {
    Route::get('/certificate/conditions', [CertificateController::class, 'conditions']);
    Route::post('/certificate/generate', [CertificateController::class, 'generate']);
    Route::get('/certificate/download', [CertificateController::class, 'download']);
});

// Panel administracji: lista wydanych certyfikatów i unieważnianie —
// ta sama bramka roli co najbardziej dotkliwa istniejąca akcja
// administracyjna (anonimizacja konta, h18.php).
Route::middleware(['auth:keycloak', 'role:project_manager,super_admin'])->group(function (): void {
    Route::get('/admin/certificates', [AdminCertificateController::class, 'index']);
    Route::post('/admin/certificates/{certificate}/revoke', [AdminCertificateController::class, 'revoke']);
});

// Publiczne: weryfikacja autentyczności (bez uwierzytelnienia, bez access.active).
// `qr` musi być zarejestrowane przed `{number}` — numer certyfikatu zawiera
// ukośniki (`NP/2026/001`), więc jego parametr dopuszcza `.*` i inaczej przejąłby
// też ścieżkę `verify/qr/...`.
// Limit żądań na adres IP: numer certyfikatu da się zgadywać (przegląd ASVS,
// wiersz V8.1.4), a trasa nie wymaga logowania.
Route::middleware('throttle:60,1')->group(function (): void {
    Route::get('/verify/qr/{token}', [VerifyController::class, 'byQrToken']);
    Route::get('/verify/{number}', [VerifyController::class, 'byNumber'])->where('number', '.*');
});
