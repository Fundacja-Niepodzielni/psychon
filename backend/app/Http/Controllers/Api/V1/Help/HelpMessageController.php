<?php

namespace App\Http\Controllers\Api\V1\Help;

use App\Http\Controllers\Controller;
use App\Http\Requests\Help\StoreHelpMessageRequest;
use App\Services\Auth\TokenRoles;
use App\Services\Help\HelpMessageService;
use Illuminate\Http\JsonResponse;

/**
 * Wyslanie wiadomosci z okna pomocy. Rola i tozsamosc nadawcy pochodza
 * wylacznie z tokena biezacego zadania (`TokenRoles`, `$request->user()`) —
 * ewentualne pola `role`/`user_id` w ciele zadania sa ignorowane,
 * `StoreHelpMessageRequest` ich nie waliduje ani nie zwraca.
 */
class HelpMessageController extends Controller
{
    public function store(
        StoreHelpMessageRequest $request,
        TokenRoles $tokenRoles,
        HelpMessageService $service,
    ): JsonResponse {
        $message = $service->send(
            $request->user(),
            $tokenRoles,
            $request->validated('content'),
            $request->validated('screen'),
        );

        return response()->json([
            'data' => [
                'id' => $message->id,
                'reference' => $message->reference,
                'created_at' => $message->created_at,
            ],
        ], 201);
    }
}
