<?php

namespace App\Http\Controllers\Api\V1\Chat;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\MessageThread;
use App\Services\H12\SupervisorAssignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Skład wątku grupowego.
 *
 * Wątek grupowy nie ma osobnej tabeli członkostwa — `MessageThread` i
 * `ChatThreadQuery` czytają skład NA ŻYWO z `SupervisorAssignment`
 * (`unassigned_at IS NULL`). Przypisanie osoby do prowadzącego nadaje
 * wyłącznie administracja (`PUT /admin/users/{id}/supervisor`), więc
 * dodawania osoby do wątku tu nie ma: `store` odpowiada tym samym 404 co
 * nieznana trasa, dla każdego identyfikatora i każdego ciała, zanim
 * cokolwiek odczyta z bazy.
 *
 * Usunięcie osoby (`destroy`) zamyka aktywne przypisanie tej pary. Rola
 * `instructor` jest odsiewana trasą (`role:instructor` w
 * `routes/api/chat.php`). Wątek, który nie jest własnym wątkiem grupowym
 * wywołującego, wygląda jak nieistniejący — to samo 404 (kontrakt §1.1).
 */
class ThreadMemberController extends Controller
{
    public function store(): never
    {
        throw new NotFoundHttpException;
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
        $threadModel = MessageThread::query()
            ->whereKey($thread)
            ->where('type', 'group')
            ->where('supervisor_id', $request->user()->id)
            ->first();

        if ($threadModel === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wątku.');
        }

        return $threadModel;
    }
}
