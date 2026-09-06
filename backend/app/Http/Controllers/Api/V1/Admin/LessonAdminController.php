<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H08\StoreLessonRequest;
use App\Http\Requests\H08\UpdateLessonRequest;
use App\Http\Resources\H08\AdminLessonResource;
use App\Models\Course;
use App\Models\Lesson;
use App\Services\H08\LessonWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H08 · CRUD lekcji w panelu administracji. Wszystkie trasy za
 * `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * Lista celowo nie jest stronicowana: kurs ma kilkanaście lekcji, a karta
 * pakietu porządkuje je w całości (kolejność, przeciąganie) — stronicowanie
 * tylko rozbiłoby ten widok. Zapis, numeracja domyślna i audyt żyją
 * w `LessonWriter`.
 *
 * Lekcja miękko usunięta jest poza wiązaniem modelu (`SoftDeletes`), więc
 * `PATCH` / `DELETE` na niej odpowiada 404 `not_found` — tak samo jak na
 * identyfikatorze, którego nigdy nie było (kontrakt §1.1).
 */
class LessonAdminController extends Controller
{
    public function index(Request $request, Course $course): JsonResponse
    {
        // Relacja `Course::lessons()` porządkuje po `sequence_order`; `id`
        // domyka remis, bo kolumna nie ma unikalności w bazie.
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

    public function store(StoreLessonRequest $request, Course $course): JsonResponse
    {
        $lesson = LessonWriter::create($course, $request->validated(), $request->user());

        return $this->resourceResponse($request, $lesson, 201);
    }

    public function update(UpdateLessonRequest $request, Lesson $lesson): JsonResponse
    {
        $lesson = LessonWriter::update($lesson, $request->validated(), $request->user());

        return $this->resourceResponse($request, $lesson);
    }

    public function destroy(Request $request, Lesson $lesson): JsonResponse
    {
        LessonWriter::delete($lesson, $request->user());

        return response()->json([
            'data' => ['id' => $lesson->id, 'deleted' => true],
        ]);
    }

    /**
     * `refresh()` przed serializacją, bo kolumny z domyślną wartością bazy
     * (`duration_seconds`) nie trafiają do modelu przy zapisie — bez odczytu
     * odpowiedź na `POST` pokazałaby `null` zamiast zapisanego `0`.
     */
    private function resourceResponse(Request $request, Lesson $lesson, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => AdminLessonResource::make($lesson->refresh()->loadCount('materials'))->resolve($request),
        ], $status);
    }
}
