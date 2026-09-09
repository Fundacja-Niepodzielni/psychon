<?php

namespace App\Http\Controllers\Api\V1\H12;

use App\Http\Controllers\Controller;
use App\Http\Requests\H12\AssignSupervisorRequest;
use App\Http\Resources\H12\InstructorSlotResource;
use App\Http\Resources\H12\SupervisorAssignmentResource;
use App\Models\SupervisionSlot;
use App\Services\H12\SupervisorAssignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSupervisionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $slots = SupervisionSlot::query()
            ->with([
                'supervisor',
                'signups' => fn ($query) => $query
                    ->with('user')
                    ->whereNull('cancelled_at')
                    ->orderBy('user_id'),
            ])
            ->withCount([
                'signups as active_signups_count' => fn ($query) => $query->whereNull('cancelled_at'),
            ])
            ->orderBy('starts_at')
            ->orderBy('id')
            ->get()
            ->map(fn (SupervisionSlot $slot): array => InstructorSlotResource::make($slot)->resolve($request))
            ->all();

        return response()->json([
            'data' => $slots,
        ]);
    }

    public function assignSupervisor(
        AssignSupervisorRequest $request,
        int $id,
        SupervisorAssignmentService $service,
    ): JsonResponse {
        $assignment = $service->assign(
            $request->user(),
            $id,
            (int) $request->validated('supervisor_id'),
        );

        return response()->json([
            'data' => SupervisorAssignmentResource::make($assignment)->resolve($request),
        ]);
    }
}
