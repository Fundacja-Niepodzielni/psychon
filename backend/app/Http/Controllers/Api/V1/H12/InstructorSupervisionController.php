<?php

namespace App\Http\Controllers\Api\V1\H12;

use App\Http\Controllers\Controller;
use App\Http\Requests\H12\InstructorGroupRequest;
use App\Http\Requests\H12\StoreSupervisionCaseRequest;
use App\Http\Requests\H12\StoreSupervisionSlotRequest;
use App\Http\Requests\H12\UpdateAttendanceRequest;
use App\Http\Resources\H12\InstructorSlotResource;
use App\Http\Resources\H12\SupervisionCaseResource;
use App\Models\SupervisionCase;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Services\H12\SupervisionAttendanceService;
use App\Services\H12\SupervisionSlotService;
use App\Services\H12\SupervisionSlotView;
use App\Support\ProgressAggregator;
use Illuminate\Http\JsonResponse;

class InstructorSupervisionController extends Controller
{
    public function group(InstructorGroupRequest $request): JsonResponse
    {
        $members = SupervisorAssignment::query()
            ->where('supervisor_id', $request->user()->id)
            ->whereNull('unassigned_at')
            ->with('volunteer')
            ->get()
            ->sortBy(fn ($assignment): string => mb_strtolower(
                $assignment->volunteer->last_name.' '.$assignment->volunteer->first_name,
            ))
            ->values()
            ->map(function ($assignment): array {
                $progress = ProgressAggregator::for($assignment->volunteer);
                unset($progress['reliability_percent']);

                return [
                    'id' => (int) $assignment->volunteer->id,
                    'first_name' => $assignment->volunteer->first_name,
                    'last_name' => $assignment->volunteer->last_name,
                    'progress' => $progress,
                ];
            })
            ->all();

        $slots = $request->user()->supervisionSlots()
            ->with([
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
            'data' => [
                'members' => $members,
                'slots' => $slots,
            ],
        ]);
    }

    public function storeSlot(StoreSupervisionSlotRequest $request, SupervisionSlotService $service): JsonResponse
    {
        $slot = $service->create($request->user(), $request->validated());

        return response()->json([
            'data' => InstructorSlotResource::make(
                SupervisionSlotView::instructor($slot),
            )->resolve($request),
        ], 201);
    }

    public function storeCase(StoreSupervisionCaseRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $case = SupervisionCase::query()->create([
            'reporter_id' => $request->user()->id,
            'volunteer_id' => $validated['volunteer_id'] ?? null,
            'subject' => $validated['subject'],
            'body' => $validated['body'],
        ]);

        return response()->json([
            'data' => SupervisionCaseResource::make($case->load('reporter', 'volunteer'))->resolve($request),
        ], 201);
    }

    public function attendance(
        UpdateAttendanceRequest $request,
        int $id,
        SupervisionAttendanceService $service,
    ): JsonResponse {
        $slot = $service->update(
            $request->user(),
            $id,
            $request->validated('attendance'),
        );

        return response()->json([
            'data' => InstructorSlotResource::make(
                SupervisionSlotView::instructor($slot),
            )->resolve($request),
        ]);
    }
}
