<?php

namespace App\Http\Controllers\Api\V1\H09;

use App\Http\Controllers\Controller;
use App\Http\Requests\H09\UpdateMyInstructorProfileRequest;
use App\Http\Resources\H09\InstructorProfileResource;
use App\Models\Course;
use App\Models\InstructorProfile;
use App\Services\H09\InstructorCourses;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * H09 · wizytówka prowadzącego widziana i edytowana przez samego prowadzącego,
 * plus lista jego kursów dla ekranu `#/panel/prowadzacy`. Za
 * `auth:sanctum` + `role:instructor`.
 */
class MyInstructorProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->instructorProfile;

        if ($profile === null) {
            $profile = new InstructorProfile(['user_id' => $user->id]);
            $profile->setRelation('user', $user);
            $profile->setRelation('supervisor', null);
        } else {
            $profile->loadMissing(['user', 'supervisor']);
        }

        return response()->json([
            'data' => (new InstructorProfileResource(
                $profile,
                InstructorCourses::for((int) $user->id),
                withSupervisor: true,
            ))->resolve($request),
        ]);
    }

    public function update(UpdateMyInstructorProfileRequest $request): JsonResponse
    {
        $user = $request->user();

        $profile = InstructorProfile::query()->firstOrCreate(['user_id' => $user->id]);
        $profile->fill($request->validated());
        $profile->save();
        $profile->loadMissing(['user', 'supervisor']);

        return response()->json([
            'data' => (new InstructorProfileResource(
                $profile,
                InstructorCourses::for((int) $user->id),
                withSupervisor: true,
            ))->resolve($request),
        ]);
    }

    public function courses(Request $request): JsonResponse
    {
        $data = InstructorCourses::for((int) $request->user()->id)
            ->map(fn (Course $course): array => [
                'id' => (int) $course->id,
                'slug' => $course->slug,
                'title' => $course->title,
                'sequence_order' => $course->sequence_order,
            ])
            ->values()
            ->all();

        return response()->json(['data' => $data]);
    }
}
