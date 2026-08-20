<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 — route loader
|--------------------------------------------------------------------------
| The starter loads the auth routes plus one file per package
| (routes/api/h01.php … h21.php). Each package owns ONLY its own file —
| do not touch other packages' files (guide §5.1).
*/

Route::prefix('v1')->group(function (): void {
    require __DIR__.'/api/auth.php';

    foreach (range(1, 21) as $package) {
        require __DIR__.sprintf('/api/h%02d.php', $package);
    }
});
