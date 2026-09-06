<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H08\ReorderCoursesRequest;
use App\Http\Requests\H08\ReorderLessonsRequest;
use App\Http\Resources\H08\AdminCourseResource;
use App\Http\Resources\H08\AdminLessonResource;
use App\Models\Course;
use App\Models\Lesson;
use App\Services\H08\ReorderImpactPreview;
use App\Services\H08\SequenceReorderer;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H08 · kolejność lekcji w kursie i kursów w ścieżce oraz podgląd
 * wpływu proponowanej kolejności na statusy uczestników. Wszystkie trasy za
 * `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * `PATCH .../reorder` jest wyjątkiem nazewniczym wymienionym wprost
 * w kontrakcie §1 — nowych takich wyjątków nie tworzymy.
 *
 * Kontroler jest cienki: renumeracja, walidacja permutacji i audyt żyją
 * w `SequenceReorderer`, a pomiar wpływu w `ReorderImpactPreview`.
 */
class CourseSequenceController extends Controller
{
    public function reorderLessons(ReorderLessonsRequest $request, Course $course): JsonResponse
    {
        $lessons = SequenceReorderer::reorderLessons($course, $request->lessonIds(), $request->user());

        return response()->json([
            'data' => $lessons
                ->map(fn (Lesson $lesson): array => AdminLessonResource::make($lesson)->resolve($request))
                ->values()
                ->all(),
        ]);
    }

    public function reorderCourses(ReorderCoursesRequest $request): JsonResponse
    {
        $courses = SequenceReorderer::reorderCourses($request->courseIds(), $request->user());

        return response()->json([
            'data' => $courses
                ->map(fn (Course $course): array => AdminCourseResource::make($course)->resolve($request))
                ->values()
                ->all(),
        ]);
    }

    /**
     * Podgląd niczego nie zapisuje — mierzy skutek na wycofywanej transakcji.
     */
    public function preview(ReorderCoursesRequest $request): JsonResponse
    {
        return response()->json([
            'data' => ReorderImpactPreview::for($request->courseIds()),
        ]);
    }
}
