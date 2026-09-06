<?php

use App\Http\Controllers\Oidc\BackchannelLogoutController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/*
|--------------------------------------------------------------------------
| POST /oidc/backchannel-logout (OIDC Back-Channel Logout 1.0)
|--------------------------------------------------------------------------
| The path is frozen: the realm's `psychon-api` client has it registered as
| `backchannel.logout.url`, so anything other than this exact path means
| Keycloak's call never arrives. Registered here rather than in
| `routes/api.php` because that file is mounted under `/api`, which is not
| this contract's path.
|
| `withoutMiddleware('web')` strips cookie encryption, session start and
| CSRF verification — this endpoint is form-encoded, called by the identity
| provider itself (never a browser), and the contract is explicit: no CSRF,
| no session (docs/INTEGRACJA-KONTRAKT.md §4.5).
*/
Route::post('/oidc/backchannel-logout', BackchannelLogoutController::class)
    ->withoutMiddleware('web');
