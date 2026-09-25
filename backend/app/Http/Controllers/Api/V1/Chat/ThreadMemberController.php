<?php

namespace App\Http\Controllers\Api\V1\Chat;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\H12\SupervisorAssignmentResource;
use App\Models\MessageThread;
use App\Models\User;
use App\Services\H12\SupervisorAssignmentService;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Skład wątku grupowego — dodanie i usunięcie osoby, wyłącznie przez
 * prowadzącego, który jest właścicielem TEGO KONKRETNEGO wątku — tylko
 * prowadzący dodaje i usuwa osoby.
 *
 * Wątek grupowy nie ma osobnej tabeli członkostwa — `MessageThread` i
 * `ChatThreadQuery` czytają skład NA ŻYWO z `SupervisorAssignment`
 * (`unassigned_at IS NULL`). „Dodanie do wątku" to więc przypisanie
 * wolontariusza do tego prowadzącego (ten sam mechanizm co
 * `SupervisorAssignmentService`, dotąd wołany tylko przez administrację pod
 * `/admin/users/{id}/supervisor`); „usunięcie" to zamknięcie aktywnego
 * przypisania.
 *
 * Rola `instructor` jest odsiewana trasą (`role:instructor` w
 * `routes/api/chat.php`) — administracja i uczestnik (wolontariusz) dostają
 * 403 zanim dotrą tutaj. Własność TEGO wątku (czy wywołujący jest jego
 * `supervisor_id`) jest sprawdzana tutaj — inny prowadzący, spoza tej
 * konkretnej grupy, też dostaje 403.
 */
class ThreadMemberController extends Controller
{
    public function store(
        Request $request,
        int $thread,
        int $user,
        SupervisorAssignmentService $service,
    ): JsonResponse {
        $threadModel = $this->ownGroupThread($request, $thread);

        $assignment = $service->assign($request->user(), $user, (int) $threadModel->supervisor_id);

        $volunteer = User::query()->find($user);
        if ($volunteer !== null) {
            // `thread.member_added` NIE figuruje jeszcze w rejestrze §3.1 —
            // ten sam stan, w którym jest już `message.received`
            // (ChatMessageService) — czat jest tu nowym modułem.
            Notify::send(
                $volunteer,
                'thread.member_added',
                'Dołączenie do wątku grupowego',
                'Prowadzący dodał(a) Cię do wątku grupowego.',
                '/panel/superwizja',
            );
        }

        return response()->json([
            'data' => SupervisorAssignmentResource::make($assignment)->resolve($request),
        ], 201);
    }

    public function destroy(
        Request $request,
        int $thread,
        int $user,
        SupervisorAssignmentService $service,
    ): JsonResponse {
        $threadModel = $this->ownGroupThread($request, $thread);

        $service->unassign($user, (int) $threadModel->supervisor_id);

        return response()->json(['data' => null]);
    }

    private function ownGroupThread(Request $request, int $thread): MessageThread
    {
        $threadModel = MessageThread::query()->whereKey($thread)->first();

        if ($threadModel === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wątku.');
        }

        if (! $threadModel->isGroup() || (int) $threadModel->supervisor_id !== (int) $request->user()->id) {
            throw new ApiException(403, 'forbidden', 'Nie zarządzasz składem tego wątku.');
        }

        return $threadModel;
    }
}
