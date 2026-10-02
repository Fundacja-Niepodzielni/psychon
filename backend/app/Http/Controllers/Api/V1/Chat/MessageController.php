<?php

namespace App\Http\Controllers\Api\V1\Chat;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\StoreMessageRequest;
use App\Http\Resources\Chat\MessageResource;
use App\Services\Auth\TokenRoles;
use App\Services\Chat\ChatMessageService;
use App\Services\Chat\ChatThreadQuery;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Wysłanie wiadomości do wątku czatu. Powiadomienie odbiorców idzie
 * przez `ChatMessageService`, jedynym mechanizmem `Notify::send`.
 *
 * Kolejność odmów: rola (403 `forbidden`) → wątek niewidoczny albo
 * nieistniejący (404 `not_found`, jedno dla obu) → wątek zamknięty do
 * zapisu (403 `thread_closed`) → dopiero wtedy walidacja treści (422).
 * Ciało żądania nie zmienia odpowiedzi dla wątku, do którego nie ma dostępu.
 */
class MessageController extends Controller
{
    public function store(Request $request, int $thread, TokenRoles $roles, ChatMessageService $service): JsonResponse
    {
        if (! $roles->has('volunteer', 'instructor')) {
            throw new AuthorizationException;
        }

        $user = $request->user();

        $threadModel = ChatThreadQuery::visibleTo($user)->whereKey($thread)->first();

        if ($threadModel === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wątku.');
        }

        if (! ChatThreadQuery::isOpen($threadModel)) {
            throw new ApiException(
                403,
                'thread_closed',
                'Ta rozmowa jest zamknięta. Możesz ją czytać, ale nie możesz już w niej pisać.',
            );
        }

        $body = app(StoreMessageRequest::class)->validated('body');

        $message = $service->send($threadModel, $user, $body);

        return response()->json([
            'data' => MessageResource::make($message->load('sender'))->resolve($request),
        ], 201);
    }
}
