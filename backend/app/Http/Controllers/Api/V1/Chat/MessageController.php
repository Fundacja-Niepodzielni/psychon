<?php

namespace App\Http\Controllers\Api\V1\Chat;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\StoreMessageRequest;
use App\Http\Resources\Chat\MessageResource;
use App\Services\Chat\ChatMessageService;
use App\Services\Chat\ChatThreadQuery;
use Illuminate\Http\JsonResponse;

/**
 * Wysłanie wiadomości do wątku (sprint 3, poz. 10). Powiadomienie
 * odbiorców — `ChatMessageService`, jedynym mechanizmem `Notify::send`.
 */
class MessageController extends Controller
{
    public function store(StoreMessageRequest $request, int $thread, ChatMessageService $service): JsonResponse
    {
        $user = $request->user();

        $threadModel = ChatThreadQuery::visibleTo($user)->whereKey($thread)->first();

        if ($threadModel === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wątku.');
        }

        $message = $service->send($threadModel, $user, $request->validated('body'));

        return response()->json([
            'data' => MessageResource::make($message->load('sender'))->resolve($request),
        ], 201);
    }
}
