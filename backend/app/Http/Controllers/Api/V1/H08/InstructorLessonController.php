<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Exceptions\ApiException;
use App\Http\Controllers\Concerns\RespondsWithLesson;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\StoreInstructorLessonRequest;
use App\Http\Requests\H08\UpdateInstructorLessonRequest;
use App\Models\Course;
use App\Models\Lesson;
use App\Services\H08\LessonWriter;
use App\Support\H08\LessonIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Lekcje w kursie przypisanego prowadzącego — trasy `role:instructor`
 * w `routes/api/h08.php`. Kontroler jest cienki: walidacja i zapis są
 * dokładnie te same usługi co w panelu administracji
 * (`StoreInstructorLessonRequest extends StoreLessonRequest`,
 * `UpdateInstructorLessonRequest extends UpdateLessonRequest`,
 * `LessonWriter`); różnica to sprawdzenie przypisania przez `CoursePolicy`
 * — w `authorize()` żądania, PRZED walidacją ciała, i powtórnie tutaj przed
 * zapisem.
 */
class InstructorLessonController extends Controller
{
    use RespondsWithLesson;

    public function index(Request $request, Course $course): JsonResponse
    {
        $this->authorizeCourse($request, $course);

        return LessonIndex::response($course, $request);
    }

    public function store(StoreInstructorLessonRequest $request, Course $course): JsonResponse
    {
        $this->authorizeCourse($request, $course);

        $lesson = LessonWriter::create($course, $request->validated(), $request->user());

        return $this->resourceResponse($request, $lesson, 201);
    }

    public function update(UpdateInstructorLessonRequest $request, Lesson $lesson): JsonResponse
    {
        $this->authorizeLesson($request, $lesson);

        $lesson = LessonWriter::update($lesson, $request->validated(), $request->user());

        return $this->resourceResponse($request, $lesson);
    }

    public function destroy(Request $request, Lesson $lesson): JsonResponse
    {
        $this->authorizeLesson($request, $lesson);

        LessonWriter::delete($lesson, $request->user());

        return response()->json([
            'data' => ['id' => $lesson->id, 'deleted' => true],
        ]);
    }

    private function authorizeCourse(Request $request, Course $course): void
    {
        if ($request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }
    }

    /**
     * Kurs miękko usunięty nadal jest poprawnym podmiotem tej sprawdzki —
     * `withTrashed()` tak samo jak w `LessonWriter::courseOf()`, którego
     * kontroler administracyjny używa pośrednio, a tu trzeba powtórzyć,
     * bo tamta metoda jest prywatna.
     */
    private function authorizeLesson(Request $request, Lesson $lesson): void
    {
        $course = $lesson->course()->withTrashed()->first();

        if ($course === null || $request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }
    }
}
