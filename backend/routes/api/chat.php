<?php

/*
|--------------------------------------------------------------------------
| Czat asynchroniczny — wątki i wiadomości
|--------------------------------------------------------------------------
| Osobny plik tras czatu, dołączony w routes/api.php obok pętli ładującej
| pakiety hackathonowe h01–h21.
|
| Autoryzacja per-wątek NIE jest rolą — 404 (nigdy 403) dla cudzego wątku,
| więc żadnej bramki `role:` tutaj: kto NIE jest stroną wątku dostaje 404
| z ChatThreadQuery::visibleTo, niezależnie od roli tokena.
|
| Kontrakt: docs/hackathon/02-kontrakt-api.md — endpointy czatu i typ
| powiadomienia `message.received` jeszcze nienotowane w §2/§3.1
| (rejestr typów powiadomień).
*/

use App\Http\Controllers\Api\V1\Chat\MessageController;
use App\Http\Controllers\Api\V1\Chat\ThreadController;
use Illuminate\Support\Facades\Route;

if (! config('features.chat', true)) {
    return;
}

Route::middleware(['auth:keycloak', 'access.active'])->group(function (): void {
    Route::get('/threads', [ThreadController::class, 'index']);
    Route::get('/threads/{thread}', [ThreadController::class, 'show'])->whereNumber('thread');
    Route::post('/threads/{thread}/messages', [MessageController::class, 'store'])->whereNumber('thread');
});
