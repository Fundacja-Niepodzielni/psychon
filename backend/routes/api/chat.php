<?php

/*
|--------------------------------------------------------------------------
| Czat asynchroniczny — wątki i wiadomości (sprint 3, poz. 10)
|--------------------------------------------------------------------------
| Nowy moduł, poza numeracją pakietów hackathonowych h01–h21 — routes/api.php
| ładuje wyłącznie `foreach (range(1, 21) as $package) { require .../hNN.php; }`
| i jest poza zakresem tej rundy (plik wspólny, patrz raport rundy: jedna
| linia `require __DIR__.'/api/chat.php';` czeka na zgodę integratora).
|
| Autoryzacja per-wątek NIE jest rolą — 404 (nigdy 403) dla cudzego wątku,
| więc żadnej bramki `role:` tutaj: kto NIE jest stroną wątku dostaje 404
| z ChatThreadQuery::visibleTo, niezależnie od roli tokena.
|
| Kontrakt: docs/hackathon/02-kontrakt-api.md — endpointy czatu jeszcze
| nienotowane w §2/§3.1 (rejestr typów powiadomień), do zgłoszenia
| strażnikowi kontraktu.
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
