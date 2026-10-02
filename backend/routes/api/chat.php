<?php

/*
|--------------------------------------------------------------------------
| Czat asynchroniczny — wątki i wiadomości
|--------------------------------------------------------------------------
| Osobny plik tras czatu, dołączony w routes/api.php obok pętli ładującej
| pakiety hackathonowe h01–h21.
|
| Autoryzacja per-wątek (odczyt wątku, wysyłka wiadomości) NIE jest rolą —
| 404 (nigdy 403) dla cudzego wątku, więc żadnej bramki `role:` na tych
| trasach: kto NIE jest stroną wątku dostaje 404 z ChatThreadQuery::visibleTo,
| niezależnie od roli tokena.
|
| Założenie wątku grupowego należy wyłącznie do prowadzącego, więc TU jest
| bramka `role:instructor`.
|
| Skład grupy wyznacza przypisanie superwizora, które nadaje i kończy
| wyłącznie administracja (`PUT /admin/users/{id}/supervisor`). Pod adresem
| składu wątku (`/threads/{thread}/members/{user}`) nie ma żadnej trasy:
| każda metoda dostaje od każdego, z tokenem i bez, tę samą odpowiedź co
| nieznany adres.
|
| Kontrakt: docs/hackathon/02-kontrakt-api.md — endpointy czatu i typy
| powiadomień `message.received`/`thread.member_added` jeszcze nienotowane
| w §2/§3.1 (rejestr typów powiadomień).
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

Route::middleware(['auth:keycloak', 'access.active', 'role:instructor'])->group(function (): void {
    Route::post('/threads', [ThreadController::class, 'store']);
});
