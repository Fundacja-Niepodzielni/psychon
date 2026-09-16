<?php

namespace App\Http\Controllers\Api\V1\Chat;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\Chat\MessageResource;
use App\Http\Resources\Chat\MessageThreadResource;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Services\Auth\TokenRoles;
use App\Services\Chat\ChatThreadProvisioner;
use App\Services\Chat\ChatThreadQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;

/**
 * Wątki czatu asynchronicznego (sprint 3, poz. 10) — lista wątków
 * zalogowanego i odczyt jednego wątku ze stronicowaniem wiadomości.
 */
class ThreadController extends Controller
{
    public function index(
        Request $request,
        TokenRoles $tokenRoles,
        ChatThreadProvisioner $provisioner,
    ): AnonymousResourceCollection {
        $user = $request->user();

        // R2 (sprint-2 §1): rola z TOKENA, nigdy z `users.role` — decyduje,
        // które wątki wolno dociągnąć/utworzyć dla tego wywołania.
        $roles = $tokenRoles->current();

        /** @var Collection<int, MessageThread> $threads */
        $threads = collect();

        if (in_array('volunteer', $roles, true)) {
            $active = SupervisorAssignment::query()
                ->where('volunteer_id', $user->id)
                ->whereNull('unassigned_at')
                ->with('supervisor')
                ->first();

            if ($active !== null && $active->supervisor !== null) {
                $threads->push($provisioner->ensureIndividual($user, $active->supervisor));
                $threads->push($provisioner->ensureGroup($active->supervisor));
            }
        }

        if (in_array('instructor', $roles, true)) {
            $threads->push($provisioner->ensureGroup($user));

            SupervisorAssignment::query()
                ->where('supervisor_id', $user->id)
                ->whereNull('unassigned_at')
                ->with('volunteer')
                ->get()
                ->each(function (SupervisorAssignment $assignment) use ($threads, $provisioner, $user): void {
                    if ($assignment->volunteer !== null) {
                        $threads->push($provisioner->ensureIndividual($assignment->volunteer, $user));
                    }
                });
        }

        $threads = $threads
            ->unique('id')
            ->values()
            ->each(fn (MessageThread $thread) => $thread->loadMissing(['supervisor', 'volunteer']))
            ->sortByDesc(fn (MessageThread $thread) => $thread->updated_at)
            ->values();

        return MessageThreadResource::collection($threads);
    }

    public function show(Request $request, int $thread): JsonResponse
    {
        $user = $request->user();

        $threadModel = ChatThreadQuery::visibleTo($user)->whereKey($thread)->first();

        // Cudzy wątek i nieistniejący wątek wyglądają identycznie na zewnątrz
        // (kontrakt §1.1) — 404, nigdy 403. To jest serce tej pozycji (K3).
        if ($threadModel === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wątku.');
        }

        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = $threadModel->messages()
            ->with('sender')
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (Message $message): array => MessageResource::make($message)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'extra' => [
                    'thread_id' => $threadModel->id,
                    'type' => $threadModel->type,
                ],
            ],
        ]);
    }
}
