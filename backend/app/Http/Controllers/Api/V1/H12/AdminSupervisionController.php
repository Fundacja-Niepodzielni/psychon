<?php

namespace App\Http\Controllers\Api\V1\H12;

use App\Http\Controllers\Controller;
use App\Http\Requests\H12\AssignSupervisorRequest;
use App\Http\Resources\H12\SupervisorAssignmentResource;
use App\Services\H12\SupervisorAssignmentService;
use Illuminate\Http\JsonResponse;

class AdminSupervisionController extends Controller
{
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
