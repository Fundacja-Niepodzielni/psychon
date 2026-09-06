<?php

namespace App\Http\Controllers\Api\V1\H12;

use App\Http\Controllers\Controller;
use App\Http\Requests\H12\InstructorGroupRequest;
use App\Http\Requests\H12\StoreSupervisionSlotRequest;
use App\Http\Requests\H12\UpdateAttendanceRequest;
use App\Http\Resources\H12\InstructorSlotResource;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Services\H12\SupervisionAttendanceService;
use App\Services\H12\SupervisionSlotView;
use App\Support\ProgressAggregator;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

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

    public function storeSlot(StoreSupervisionSlotRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $startsAt = Carbon::parse($validated['starts_at'])->utc();

        if (! $startsAt->isFuture()) {
            return response()->json([
                'error' => [
                    'status' => 422,
                    'code' => 'validation_failed',
                    'message' => 'Termin musi rozpoczynać się w przyszłości.',
                    'errors' => ['starts_at' => ['Termin musi rozpoczynać się w przyszłości.']],
                ],
            ], 422);
        }

        $slot = SupervisionSlot::query()->create([
            'supervisor_id' => $request->user()->id,
            'starts_at' => $startsAt,
            'duration_minutes' => $validated['duration_minutes'] ?? 90,
            'seats_limit' => $validated['seats_limit'] ?? 3,
            'location_or_link' => $validated['location_or_link'] ?? null,
        ]);

        return response()->json([
            'data' => InstructorSlotResource::make(
                SupervisionSlotView::instructor($slot),
            )->resolve($request),
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
