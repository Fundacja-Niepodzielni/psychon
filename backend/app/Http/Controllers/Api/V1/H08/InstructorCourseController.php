<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\InstructorStoreCourseRequest;
use App\Http\Requests\H08\UpdateInstructorCourseRequest;
use App\Http\Resources\H08\AdminCourseResource;
use App\Models\Course;
use App\Services\H08\CourseWriter;
use App\Services\H08\InstructorCourseAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Treść kursu przez prowadzącego — trasy `role:instructor`
 * w `routes/api/h08.php`. Założenie nowego kursu (`store`) i edycja treści
 * kursu, do którego prowadzący jest przypisany (`show`/`update`).
 *
 * Walidacja edycji jest współdzielona z panelem administracji przez
 * `UpdateInstructorCourseRequest extends UpdateCourseRequest`; to, co
 * z niej trafia do zapisu, ogranicza to dopiero ten kontroler.
 * `UpdateInstructorCourseRequest::authorize()` sprawdza przypisanie
 * prowadzącego PRZED walidacją ciała — inaczej `FormRequest` biegnie
 * przed sprawdzeniem niżej i cudze `slug`/`title` dawały 422 zamiast 403.
 */
class InstructorCourseController extends Controller
{
    /** Pola treści, które prowadzący może zmienić — bez publikacji i kolejności. */
    private const array EDITABLE_FIELDS = ['title', 'description'];

    /**
     * Prowadzący zakłada własny kurs — powstaje jako szkic
     * (`CourseWriter::create`, ten sam zasób co `POST /admin/courses`) i od
     * razu zostaje jego prowadzącym (`InstructorCourseAssignment`,
     * istniejąca ścieżka H09). Publikacja i kolejność w ścieżce zostają przy
     * administracji.
     */
    public function store(InstructorStoreCourseRequest $request): JsonResponse
    {
        $course = CourseWriter::create($request->validated(), $request->user());

        InstructorCourseAssignment::assignCreator($course, $request->user());

        return $this->resourceResponse($request, $course, 201);
    }

    /**
     * Pojedynczy kurs do ekranu edycji: `GET /instructor/courses` (H09) niesie
     * tylko skrót listy (`id`, `slug`, `title`, `sequence_order`), bez opisu —
     * za mało, żeby wypełnić formularz treści. Ta sama polityka co zapis.
     */
    public function show(Request $request, Course $course): JsonResponse
    {
        if ($request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        return $this->resourceResponse($request, $course);
    }

    public function update(UpdateInstructorCourseRequest $request, Course $course): JsonResponse
    {
        if ($request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        $content = $request->safe()->only(self::EDITABLE_FIELDS);

        $course = CourseWriter::update($course, $content, $request->user());

        return $this->resourceResponse($request, $course);
    }

    private function resourceResponse(Request $request, Course $course, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => AdminCourseResource::make($course->loadCount(['lessons', 'materials']))->resolve($request),
        ], $status);
    }
}
