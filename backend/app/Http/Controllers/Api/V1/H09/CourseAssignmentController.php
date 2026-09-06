<?php

namespace App\Http\Controllers\Api\V1\H09;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H09\DeleteCourseAssignmentRequest;
use App\Http\Requests\H09\StoreCourseAssignmentRequest;
use App\Http\Resources\H09\CourseAssignmentResource;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * H09 · przypisania prowadzących do kursów i lekcji (administracja).
 * Kontrakt: brak sekcji §2 — kształt tras potwierdza strażnik (K1–K12,
 * DEMO/H9-prep-doc.md §6). Audyt: assignment.created / assignment.removed.
 */
class CourseAssignmentController extends Controller
{
    public function index(Request $request, int $course): JsonResponse
    {
        $courseModel = $this->course($course);

        $assignments = CourseAssignment::query()
            ->where('course_id', $courseModel->id)
            ->whereNull('unassigned_at')
            ->with('instructor')
            ->orderBy('lesson_id') // przypisanie kursowe (null) pierwsze
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => CourseAssignmentResource::collection($assignments)->resolve($request),
        ]);
    }

    public function store(StoreCourseAssignmentRequest $request, int $course): JsonResponse
    {
        $courseModel = $this->course($course);
        $lessonId = $request->integer('lesson_id') ?: null;
        $instructorId = (int) $request->validated('instructor_id');

        $assignment = DB::transaction(function () use ($request, $courseModel, $lessonId, $instructorId): CourseAssignment {
            $existing = CourseAssignment::query()
                ->where('course_id', $courseModel->id)
                ->when(
                    $lessonId === null,
                    fn ($query) => $query->whereNull('lesson_id'),
                    fn ($query) => $query->where('lesson_id', $lessonId),
                )
                ->whereNull('unassigned_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                throw new ApiException(
                    422,
                    'conditions_not_met',
                    'Ten kurs lub ta lekcja ma już przypisanego prowadzącego. Najpierw odłącz obecnego.',
                    reason: ['assignment_id' => $existing->id],
                );
            }

            $assignment = CourseAssignment::query()->create([
                'course_id' => $courseModel->id,
                'lesson_id' => $lessonId,
                'instructor_id' => $instructorId,
                'assigned_by' => $request->user()->id,
                'assigned_at' => now(),
            ])->load('instructor');

            AuditLog::record($request->user(), 'assignment.created', $assignment, [
                'course_id' => $courseModel->id,
                'lesson_id' => $lessonId,
                'instructor_id' => $instructorId,
            ]);

            Notify::send(
                $assignment->instructor,
                'assignment.created',
                'Przypisano Cię jako prowadzącego',
                $this->notificationBody($courseModel, $lessonId, created: true),
                '/panel/prowadzacy',
            );

            return $assignment;
        });

        return response()->json([
            'data' => CourseAssignmentResource::make($assignment)->resolve($request),
        ], 201);
    }

    public function destroy(DeleteCourseAssignmentRequest $request, int $course): JsonResponse
    {
        $courseModel = $this->course($course);

        $assignment = DB::transaction(function () use ($request, $courseModel): CourseAssignment {
            $assignment = CourseAssignment::query()
                ->whereKey((int) $request->validated('assignment_id'))
                ->where('course_id', $courseModel->id)
                ->whereNull('unassigned_at')
                ->with('instructor')
                ->lockForUpdate()
                ->first();

            if ($assignment === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono aktywnego przypisania.');
            }

            $assignment->forceFill(['unassigned_at' => now()])->save();

            AuditLog::record($request->user(), 'assignment.removed', $assignment, [
                'course_id' => $courseModel->id,
                'lesson_id' => $assignment->lesson_id,
                'instructor_id' => $assignment->instructor_id,
            ]);

            Notify::send(
                $assignment->instructor,
                'assignment.removed',
                'Zdjęto przypisanie prowadzącego',
                $this->notificationBody($courseModel, $assignment->lesson_id, created: false),
                '/panel/prowadzacy',
            );

            return $assignment;
        });

        return response()->json([
            'data' => CourseAssignmentResource::make($assignment)->resolve($request),
        ]);
    }

    private function course(int $courseId): Course
    {
        $course = Course::query()->whereKey($courseId)->first();

        if ($course === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono kursu.');
        }

        return $course;
    }

    private function notificationBody(Course $course, ?int $lessonId, bool $created): string
    {
        $scope = $lessonId !== null
            ? "lekcji w kursie „{$course->title}”"
            : "kursu „{$course->title}”";

        return $created
            ? "Zostałeś przypisany jako prowadzący {$scope}."
            : "Twoje przypisanie jako prowadzącego {$scope} zostało zdjęte.";
    }
}
