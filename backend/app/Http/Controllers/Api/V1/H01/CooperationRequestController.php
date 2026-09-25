<?php

namespace App\Http\Controllers\Api\V1\H01;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H01\StoreCooperationRequestRequest;
use App\Http\Resources\H01\CooperationRequestResource;
use App\Models\CooperationRequest;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Zgłoszenie dalszej współpracy — strona osoby, która zakończyła program.
 */
class CooperationRequestController extends Controller
{
    public function store(StoreCooperationRequestRequest $request): JsonResponse
    {
        $cooperation = DB::transaction(function () use ($request): CooperationRequest {
            // Blokada wiersza osoby szereguje równoległe zgłoszenia tej samej
            // osoby, więc reguła „jedno otwarte naraz” nie przecieka przy wyścigu.
            $user = User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();

            $hasOpen = CooperationRequest::query()
                ->where('user_id', $user->id)
                ->whereIn('status', CooperationRequest::OPEN_STATUSES)
                ->exists();

            if ($hasOpen) {
                throw new ApiException(
                    409,
                    'cooperation_request_open',
                    'Masz już otwarte zgłoszenie współpracy. Poczekaj na odpowiedź.',
                );
            }

            $cooperation = CooperationRequest::create([
                'user_id' => $user->id,
                'body' => $request->validated('body'),
                'status' => 'new',
            ]);

            AuditLog::record($user, 'cooperation_request.created', $cooperation, [
                'request_id' => $cooperation->id,
            ]);

            return $cooperation;
        });

        return response()->json([
            'data' => CooperationRequestResource::make($cooperation)->resolve($request),
        ], 201);
    }

    public function mine(Request $request, TokenRoles $roles): JsonResponse
    {
        if (! $roles->has('volunteer', 'student')) {
            throw new ApiException(403, 'forbidden', 'Nie masz dostępu do tej sekcji.');
        }

        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = CooperationRequest::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (CooperationRequest $item): array => CooperationRequestResource::make($item)->resolve($request))
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
}
