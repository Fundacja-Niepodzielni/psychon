<?php

namespace App\Http\Controllers\Api\V1\H12;

use App\Http\Controllers\Controller;
use App\Http\Requests\H12\CancelSignupRequest;
use App\Http\Requests\H12\ListSupervisionSlotsRequest;
use App\Http\Requests\H12\SignupRequest;
use App\Http\Resources\H12\SupervisionSlotResource;
use App\Models\SupervisionSlot;
use App\Services\H12\SupervisionSignupService;
use App\Services\H12\SupervisionSlotView;
use Illuminate\Http\JsonResponse;

class ParticipantSupervisionController extends Controller
{
    public function index(ListSupervisionSlotsRequest $request): JsonResponse
    {
        $assignment = $request->user()->supervisorAssignments()
            ->whereNull('unassigned_at')
            ->orderByDesc('assigned_at')
            ->first();

        if ($assignment === null) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'per_page' => $request->integer('per_page', 25),
                    'total' => 0,
                    'last_page' => 1,
                ],
            ]);
        }

        $paginator = SupervisionSlot::query()
            ->where('supervisor_id', $assignment->supervisor_id)
            ->with([
                'signups' => fn ($query) => $query
                    ->where('user_id', $request->user()->id)
                    ->whereNull('cancelled_at'),
            ])
            ->withCount([
                'signups as active_signups_count' => fn ($query) => $query->whereNull('cancelled_at'),
            ])
            ->orderBy('starts_at')
            ->orderBy('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (SupervisionSlot $slot): array => SupervisionSlotResource::make($slot)->resolve($request))
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

    public function signup(SignupRequest $request, int $id, SupervisionSignupService $service): JsonResponse
    {
        $slot = $service->signup($request->user(), $id);

        return response()->json([
            'data' => SupervisionSlotResource::make(
                SupervisionSlotView::participant($slot, $request->user()),
            )->resolve($request),
        ], 201);
    }

    public function cancel(CancelSignupRequest $request, int $id, SupervisionSignupService $service): JsonResponse
    {
        $slot = $service->cancel($request->user(), $id);

        return response()->json([
            'data' => SupervisionSlotResource::make(
                SupervisionSlotView::participant($slot, $request->user()),
            )->resolve($request),
        ]);
    }
}
