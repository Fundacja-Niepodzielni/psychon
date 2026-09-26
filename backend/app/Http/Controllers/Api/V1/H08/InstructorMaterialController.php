<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Exceptions\ApiException;
use App\Http\Controllers\Concerns\RespondsWithMaterial;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\StoreInstructorMaterialRequest;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Material;
use App\Services\H08\MaterialStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Materiały w kursie przypisanego prowadzącego — trasy `role:instructor`
 * w `routes/api/h08.php`. Ten sam trójkąt operacji co w panelu
 * administracji (`MaterialAdminController`): tu nie ma ani listy, ani
 * edycji, bo tamten kontroler też ich nie ma — nie wprowadzamy nowych
 * operacji.
 */
class InstructorMaterialController extends Controller
{
    use RespondsWithMaterial;

    public function storeForLesson(StoreInstructorMaterialRequest $request, Lesson $lesson): JsonResponse
    {
        $course = $lesson->course()->withTrashed()->first();

        if ($course === null || $request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        return $this->storeMaterialForLesson($request, $lesson);
    }

    public function storeForCourse(StoreInstructorMaterialRequest $request, Course $course): JsonResponse
    {
        if ($request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        return $this->storeMaterialForCourse($request, $course);
    }

    public function destroy(Request $request, Material $material): JsonResponse
    {
        $course = $this->courseOf($material);

        if ($course === null || $request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        MaterialStore::delete($material, $request->user());

        return response()->json([
            'data' => ['id' => $material->id, 'deleted' => true],
        ]);
    }

    /**
     * Materiał wisi przy kursie albo przy lekcji — powtórzenie
     * `MaterialStore::courseIdOf()`/`courseOf()`, które są prywatne
     * i niedostępne stąd wprost.
     */
    private function courseOf(Material $material): ?Course
    {
        if ($material->course_id !== null) {
            return Course::withTrashed()->find($material->course_id);
        }

        if ($material->lesson_id === null) {
            return null;
        }

        $courseId = Lesson::withTrashed()->whereKey($material->lesson_id)->value('course_id');

        return $courseId === null ? null : Course::withTrashed()->find($courseId);
    }
}
