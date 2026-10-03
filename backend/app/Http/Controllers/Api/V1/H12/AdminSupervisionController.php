<?php

namespace App\Http\Controllers\Api\V1\H12;

use App\Http\Controllers\Controller;
use App\Http\Requests\H12\AssignSupervisorRequest;
use App\Http\Requests\H12\AssignSupervisorToManyRequest;
use App\Http\Requests\H12\CancelSupervisionSlotRequest;
use App\Http\Requests\H12\UpdateSupervisionSlotRequest;
use App\Http\Resources\H12\InstructorSlotResource;
use App\Http\Resources\H12\SupervisionCaseResource;
use App\Http\Resources\H12\SupervisorAssignmentResource;
use App\Models\SupervisionCase;
use App\Models\SupervisionSlot;
use App\Services\H12\SupervisionSlotService;
use App\Services\H12\SupervisionSlotView;
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

    public function updateSlot(
        UpdateSupervisionSlotRequest $request,
        int $id,
        SupervisionSlotService $service,
    ): JsonResponse {
        $slot = $service->update($id, $request->validated());

        return response()->json([
            'data' => InstructorSlotResource::make(
                SupervisionSlotView::instructor($slot->load('supervisor')),
            )->resolve($request),
        ]);
    }

    public function cancelSlot(
        CancelSupervisionSlotRequest $request,
        int $id,
        SupervisionSlotService $service,
    ): JsonResponse {
        $result = $service->cancel($request->user(), $id);

        return response()->json([
            'data' => [
                'id' => $id,
                'signups_released' => $result['released'],
                'cancelled_at' => $result['cancelled_at']->toIso8601ZuluString(),
            ],
        ]);
    }

    public function cases(Request $request): JsonResponse
    {
        $cases = SupervisionCase::query()
            ->with(['reporter', 'volunteer'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (SupervisionCase $case): array => SupervisionCaseResource::make($case)->resolve($request))
            ->all();

        return response()->json([
            'data' => $cases,
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

    /**
     * Jeden prowadzący dla wielu osób naraz: dla każdej osoby ta sama usługa
     * co w `assignSupervisor` (`SupervisorAssignmentService::assign`), wynik
     * dla każdej osoby w kolejności żądania i podsumowanie.
     */
    public function assignSupervisorToMany(
        AssignSupervisorToManyRequest $request,
        SupervisorAssignmentService $service,
    ): JsonResponse {
        $supervisorId = (int) $request->validated('supervisor_id');
        $results = $service->assignToMany($request->user(), $supervisorId, $request->userIds());
        $count = fn (string $result): int => count(array_filter(
            $results,
            fn (array $row): bool => $row['result'] === $result,
        ));

        return response()->json([
            'data' => [
                'supervisor_id' => $supervisorId,
                'results' => $results,
                'summary' => [
                    'requested' => count($results),
                    'assigned' => $count('assigned'),
                    'unchanged' => $count('unchanged'),
                    'refused' => $count('refused'),
                    'not_found' => $count('not_found'),
                ],
            ],
        ]);
    }
}
