<?php

use App\Http\Controllers\Api\V1\MeController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 — route loader
|--------------------------------------------------------------------------
| The starter loads the SSO routes plus one file per package
| (routes/api/h01.php … h22.php). Each package owns ONLY its own file —
| do not touch other packages' files (guide §5.1).
*/

Route::prefix('v1')->group(function (): void {
    require __DIR__.'/api/sso.php';

    // `/me` — minimal starter shape, used when `features.h01` is off;
    // `h01.php` overrides this route with the fuller profile shape when
    // the flag is on. Lives here (rather than in the now-deleted
    // routes/api/auth.php) so it survives with the SSO-only guard.
    Route::middleware('auth:keycloak')->get('/me', MeController::class);

    foreach (range(1, 22) as $package) {
        require __DIR__.sprintf('/api/h%02d.php', $package);
    }
    require __DIR__.'/api/chat.php';
    require __DIR__.'/api/video.php';
});
