<?php

/*
|--------------------------------------------------------------------------
| Czat pomocy — zaplecze
|--------------------------------------------------------------------------
| Osobny plik tras zgloszen z okna pomocy, dolaczony w routes/api.php obok
| chat.php i video.php. Rola i identyfikator nadawcy pochodza WYLACZNIE
| z tokena (HelpMessageController/StoreHelpMessageRequest) — ewentualne
| pole `role`/`user_id` w ciele zadania jest ignorowane, nigdy przyjmowane.
*/

use App\Http\Controllers\Api\V1\Help\HelpMessageController;
use Illuminate\Support\Facades\Route;

if (! config('features.help', true)) {
    return;
}

Route::middleware(['auth:keycloak', 'access.active'])
    ->post('/help-messages', [HelpMessageController::class, 'store']);
