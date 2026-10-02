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
| Założenie wątku grupowego i usunięcie osoby ze składu należą wyłącznie do
| prowadzącego, więc TU jest bramka `role:instructor`; własność KONKRETNEGO
| wątku (czy wywołujący jest jego `supervisor_id`) sprawdza kontroler.
|
| Skład grupy wyznacza przypisanie superwizora, które nadaje wyłącznie
| administracja (`PUT /admin/users/{id}/supervisor`). Dodawanie osoby do
| wątku nie istnieje: `POST /threads/{thread}/members/{user}` odpowiada
| każdemu zalogowanemu tym samym 404 co nieznana trasa, zanim cokolwiek
| odczyta. Trasa zostaje zarejestrowana tylko dlatego, że `DELETE` pod tym
| samym adresem dałoby inaczej 405 zamiast 404.
|
| Kontrakt: docs/hackathon/02-kontrakt-api.md — endpointy czatu i typy
| powiadomień `message.received`/`thread.member_added` jeszcze nienotowane
| w §2/§3.1 (rejestr typów powiadomień).
*/

use App\Http\Controllers\Api\V1\Chat\MessageController;
use App\Http\Controllers\Api\V1\Chat\ThreadController;
use App\Http\Controllers\Api\V1\Chat\ThreadMemberController;
use Illuminate\Support\Facades\Route;

if (! config('features.chat', true)) {
    return;
}

Route::middleware(['auth:keycloak', 'access.active'])->group(function (): void {
    Route::get('/threads', [ThreadController::class, 'index']);
    Route::get('/threads/{thread}', [ThreadController::class, 'show'])->whereNumber('thread');
    Route::post('/threads/{thread}/messages', [MessageController::class, 'store'])->whereNumber('thread');
});

Route::middleware(['auth:keycloak'])->group(function (): void {
    Route::post('/threads/{thread}/members/{user}', [ThreadMemberController::class, 'store'])
        ->whereNumber('thread')
        ->whereNumber('user');
});

Route::middleware(['auth:keycloak', 'access.active', 'role:instructor'])->group(function (): void {
    Route::post('/threads', [ThreadController::class, 'store']);
    Route::delete('/threads/{thread}/members/{user}', [ThreadMemberController::class, 'destroy'])
        ->whereNumber('thread')
        ->whereNumber('user');
});
