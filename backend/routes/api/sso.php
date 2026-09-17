<?php

use App\Http\Controllers\Api\V1\SsoActivationConfirmationController;
use App\Http\Controllers\Api\V1\SsoBindController;
use App\Http\Controllers\Api\V1\SsoWhoAmIController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SSO (Konta Niepodzielni / Keycloak)
|--------------------------------------------------------------------------
| Bearer-token acceptance (slice 1), extended by the back-channel logout
| read path inside the same `auth.keycloak` middleware (slice 3 — see
| `AuthenticateKeycloakToken`'s own comment). The back-channel logout
| endpoint itself lives in `routes/web.php`, not here: its path is frozen
| by the realm and is not under `/api`. The existing `/auth/*` session
| login in `routes/api/auth.php` is untouched.
|
| The `auth.keycloak` middleware alias is registered in
| `App\Providers\AppServiceProvider::boot()` rather than in `bootstrap/app.php`.
| Registering it as a proper alias — instead of referencing the middleware
| class directly — is what lets `Tests\Feature\PublicRoutesSmokeTest`
| recognise this route as requiring authentication: it inspects each route's
| `gatherMiddleware()` for a string starting with `auth`, which an FQCN does
| not satisfy.
*/

Route::middleware('auth.keycloak')->get('/sso/whoami', SsoWhoAmIController::class);

// Stage E1 (the bridge): binds the calling principal's `sub` to the local
// user identified by a one-time invitation token. Guarded by the PRINCIPAL
// middleware (there is no local user yet to authenticate as), throttled
// like the existing auth routes.
Route::middleware(['auth.keycloak', 'throttle:6,1'])->post('/sso/powiaz', SsoBindController::class);

// F-190 (odsłona 2): odnotowuje pokazanie jednorazowego komunikatu
// aktywacyjnego na WŁASNYM koncie wywołującego. W odróżnieniu od dwóch tras
// wyżej potrzebuje rozwiązanego lokalnego konta (nie tylko sprawdzonego
// principala), więc idzie za tym samym `auth:keycloak`, co pozostałe trasy
// biznesowe — nigdy `auth.keycloak` — co też wyklucza wskazanie innego celu:
// nie ma żadnego identyfikatora do przekazania.
Route::middleware('auth:keycloak')->post('/sso/potwierdzenie-aktywacji', SsoActivationConfirmationController::class);
