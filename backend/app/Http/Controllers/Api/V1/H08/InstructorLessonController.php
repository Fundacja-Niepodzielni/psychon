<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\StoreInstructorLessonRequest;
use App\Http\Requests\H08\UpdateInstructorLessonRequest;
use App\Http\Resources\H08\AdminLessonResource;
use App\Models\Course;
use App\Models\Lesson;
use App\Services\H08\LessonWriter;
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
    public function index(Request $request, Course $course): JsonResponse
    {
        $this->authorizeCourse($request, $course);

        $lessons = $course->lessons()
            ->withCount('materials')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $lessons
                ->map(fn (Lesson $lesson): array => AdminLessonResource::make($lesson)->resolve($request))
                ->values()
                ->all(),
        ]);
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

    private function resourceResponse(Request $request, Lesson $lesson, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => AdminLessonResource::make($lesson->refresh()->loadCount('materials'))->resolve($request),
        ], $status);
    }
}
