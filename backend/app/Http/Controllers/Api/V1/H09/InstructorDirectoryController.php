<?php

namespace App\Http\Controllers\Api\V1\H09;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\H09\InstructorProfileResource;
use App\Models\InstructorProfile;
use App\Services\H09\InstructorCourses;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * H09 · wizytówki prowadzących. Za `auth:sanctum` + `access.active`, dostępne
 * dla każdej zalogowanej roli. DTO bez danych wrażliwych.
 */
class InstructorDirectoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = InstructorProfile::query()
            ->select('instructor_profiles.*')
            ->join('users', 'users.id', '=', 'instructor_profiles.user_id')
            ->where('users.role', 'instructor')
            ->whereNull('users.deleted_at')
            ->with('user')
            ->orderBy('users.last_name')
            ->orderBy('users.first_name')
            ->orderBy('instructor_profiles.id')
            ->paginate($perPage);

        $coursesByInstructor = InstructorCourses::forMany(
            collect($paginator->items())->pluck('user_id'),
        );

        $data = collect($paginator->items())
            ->map(fn (InstructorProfile $profile): array => (new InstructorProfileResource(
                $profile,
                $coursesByInstructor->get((int) $profile->user_id, new Collection),
            ))->resolve($request))
            ->all();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $profile = InstructorProfile::query()
            ->where('user_id', $id)
            ->whereHas('user', fn ($query) => $query->where('role', 'instructor'))
            ->with(['user', 'supervisor'])
            ->first();

        if ($profile === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wizytówki prowadzącego.');
        }

        return response()->json([
            'data' => (new InstructorProfileResource(
                $profile,
                InstructorCourses::for((int) $profile->user_id),
                withSupervisor: true,
            ))->resolve($request),
        ]);
    }
}
