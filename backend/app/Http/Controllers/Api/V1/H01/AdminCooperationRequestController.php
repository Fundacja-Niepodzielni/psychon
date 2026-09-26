<?php

namespace App\Http\Controllers\Api\V1\H01;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H01\AdminCooperationRequestIndexRequest;
use App\Http\Requests\H01\RespondCooperationRequestRequest;
use App\Http\Resources\H01\AdminCooperationRequestResource;
use App\Models\CooperationRequest;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Zgłoszenia dalszej współpracy — strona administracji.
 */
class AdminCooperationRequestController extends Controller
{
    public function index(AdminCooperationRequestIndexRequest $request): JsonResponse
    {
        $perPage = (int) ($request->validated('per_page') ?? 25);
        $status = $request->validated('status');

        $paginator = CooperationRequest::query()
            ->with('user')
            ->when($status !== null, fn ($query) => $query->where('status', $status))
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (CooperationRequest $item): array => AdminCooperationRequestResource::make($item)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function respond(RespondCooperationRequestRequest $request, int $id): JsonResponse
    {
        $cooperation = DB::transaction(function () use ($request, $id): CooperationRequest {
            $cooperation = CooperationRequest::query()
                ->with('user')
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            $owner = $cooperation?->user;
            if ($cooperation === null || ! $owner instanceof User) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono zgłoszenia.');
            }

            if ($cooperation->status === 'closed') {
                throw new ApiException(403, 'cooperation_request_closed', 'To zgłoszenie jest już zamknięte.');
            }

            $cooperation->forceFill([
                'response' => $request->validated('response'),
                'status' => $request->validated('status'),
                'responded_by' => $request->user()->id,
                'responded_at' => now(),
            ])->save();

            // Ładunek bez treści odpowiedzi: wolny tekst wpisany przez
            // administrację żyje w rekordzie, nie w rejestrze zdarzeń.
            AuditLog::record($request->user(), 'cooperation_request.answered', $cooperation, [
                'request_id' => $cooperation->id,
                'status' => $cooperation->status,
            ]);

            Notify::send(
                $owner,
                'cooperation_request.answered',
                'Odpowiedź na zgłoszenie współpracy',
                'Administracja odpowiedziała na Twoje zgłoszenie dalszej współpracy.',
                '/panel/po-programie',
            );

            return $cooperation;
        });

        return response()->json([
            'data' => AdminCooperationRequestResource::make($cooperation)->resolve($request),
        ]);
    }
}
