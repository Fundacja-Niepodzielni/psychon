<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\UpdateCourseRequest;
use App\Http\Resources\H08\AdminCourseResource;
use App\Models\Course;
use App\Services\H08\CourseWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Edycja treści kursu przez przypisanego prowadzącego — trasy
 * `role:instructor` w `routes/api/h08.php`. Kurs zakłada wyłącznie
 * administracja (`CourseCatalogAdminController`); ta trasa umożliwia
 * wyłącznie zmianę opisu i tytułu, nie status publikacji ani kolejność
 * w ścieżce.
 *
 * Walidacja jest współdzielona z panelem administracji
 * (`UpdateCourseRequest`); to, co z niej trafia do zapisu, ogranicza to
 * dopiero ten kontroler.
 */
class InstructorCourseController extends Controller
{
    /** Pola treści, które prowadzący może zmienić — bez publikacji i kolejności. */
    private const array EDITABLE_FIELDS = ['title', 'description'];

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

    public function update(UpdateCourseRequest $request, Course $course): JsonResponse
    {
        if ($request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        $content = $request->safe()->only(self::EDITABLE_FIELDS);

        $course = CourseWriter::update($course, $content, $request->user());

        return $this->resourceResponse($request, $course);
    }

    private function resourceResponse(Request $request, Course $course): JsonResponse
    {
        return response()->json([
            'data' => AdminCourseResource::make($course->loadCount(['lessons', 'materials']))->resolve($request),
        ]);
    }
}
