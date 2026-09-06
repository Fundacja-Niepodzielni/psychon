<?php

use App\Http\Controllers\Api\V1\SsoWhoAmIController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SSO (Konta Niepodzielni / Keycloak) — slice 1, `ZLECENIE-044`
|--------------------------------------------------------------------------
| Bearer-token acceptance only: no browser login flow, no logout, no role
| mapping in the UI yet (`ZALACZNIK-OD-022`). The existing `/auth/*` session
| login in `routes/api/auth.php` is untouched.
|
| The `auth.keycloak` middleware alias is registered in
| `App\Providers\AppServiceProvider::boot()` (`backend/app/Providers/*`, in
| scope) rather than in `bootstrap/app.php`, which is outside this role's
| scope (`_nadzor/straznik/zakresy/KOD-DOPIECIA.zakres` has no `WOLNO:` line
| for `backend/bootstrap/*` and no `ODBLOKOWANE:` entry was granted for it).
| Registering it as a proper alias — instead of referencing the middleware
| class directly — is what lets `Tests\Feature\PublicRoutesSmokeTest`
| recognise this route as requiring authentication: it inspects each route's
| `gatherMiddleware()` for a string starting with `auth`, which an FQCN does
| not satisfy.
*/

Route::middleware('auth.keycloak')->get('/sso/whoami', SsoWhoAmIController::class);
