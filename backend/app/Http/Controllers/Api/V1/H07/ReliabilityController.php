<?php

namespace App\Http\Controllers\Api\V1\H07;

use App\Http\Controllers\Controller;
use App\Http\Requests\H07\ListAdminReliabilityRequest;
use App\Http\Requests\H07\ListInstructorReliabilityRequest;
use App\Http\Requests\H07\ViewAdminReliabilityRequest;
use App\Http\Resources\H07\AdminReliabilityDetailResource;
use App\Http\Resources\H07\AdminReliabilityResource;
use App\Http\Resources\H07\InstructorReliabilityResource;
use App\Services\H07\AdminReliabilityQuery;
use App\Services\H07\InstructorReliabilityQuery;
use App\Services\H07\ReliabilityDetailQuery;
use Illuminate\Http\JsonResponse;

class ReliabilityController extends Controller
{
    public function adminIndex(
        ListAdminReliabilityRequest $request,
        AdminReliabilityQuery $query,
    ): JsonResponse {
        $page = (int) $request->validated('page', 1);
        $perPage = (int) $request->validated('per_page', 50);
        $paginator = $query->paginate($page, $perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (array $row): array => AdminReliabilityResource::make($row)->resolve($request))
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function adminShow(
        ViewAdminReliabilityRequest $request,
        int $userId,
        ReliabilityDetailQuery $query,
    ): JsonResponse {
        return response()->json([
            'data' => AdminReliabilityDetailResource::make($query->find($userId))->resolve($request),
        ]);
    }

    public function instructorIndex(
        ListInstructorReliabilityRequest $request,
        InstructorReliabilityQuery $query,
    ): JsonResponse {
        $rows = $query->for($request->user());

        return response()->json([
            'data' => $rows
                ->map(fn (array $row): array => InstructorReliabilityResource::make($row)->resolve($request))
                ->all(),
            'meta' => [
                'current_page' => 1,
                'per_page' => 50,
                'total' => $rows->count(),
                'last_page' => 1,
            ],
        ]);
    }
}
