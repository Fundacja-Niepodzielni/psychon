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
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Materiały w kursie przypisanego prowadzącego — trasy `role:instructor`
 * w `routes/api/h08.php`. Te same operacje co w panelu administracji
 * (`MaterialAdminController`): lista materiałów lekcji, wgrywanie i usuwanie.
 * Edycji nie ma, bo tamten kontroler też jej nie ma.
 */
class InstructorMaterialController extends Controller
{
    use RespondsWithMaterial;

    /**
     * Lista materiałów lekcji w tym samym kształcie co
     * `GET /admin/lessons/{lesson}/materials`.
     */
    public function indexForLesson(Request $request, string $lesson): JsonResponse
    {
        return $this->lessonMaterialsResponse($request, $this->lessonOfAssignedCourse($request, $lesson)->id);
    }

    /**
     * Żywa lekcja kursu, który prowadzący może edytować — reguła
     * `CoursePolicy::update` (aktywne przypisanie na poziomie kursu). Lekcja
     * nieznana, miękko usunięta i lekcja kursu bez tego przypisania dają tę
     * samą odpowiedź 404 `not_found`.
     */
    private function lessonOfAssignedCourse(Request $request, string $lesson): Lesson
    {
        // Liczba poza zakresem całkowitym nie jest identyfikatorem żadnej lekcji
        // (inaczej baza odpowiedziałaby błędem zakresu, czyli 500).
        $id = filter_var($lesson, FILTER_VALIDATE_INT);
        abort_if($id === false, 404);

        $lessonModel = Lesson::query()->whereKey($id)->firstOrFail();
        $course = $lessonModel->course()->withTrashed()->first();

        if ($course === null || $request->user()->cannot('update', $course)) {
            throw new NotFoundHttpException;
        }

        return $lessonModel;
    }

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
