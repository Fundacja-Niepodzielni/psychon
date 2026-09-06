<?php

use App\Http\Controllers\Api\V1\SsoWhoAmIController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SSO (Konta Niepodzielni / Keycloak) — slice 1
|--------------------------------------------------------------------------
| Bearer-token acceptance only: no browser login flow, no logout, no role
| mapping in the UI yet. The existing `/auth/*` session login in
| `routes/api/auth.php` is untouched.
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
