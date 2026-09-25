<?php

namespace App\Http\Controllers\Api\V1\H10;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H10\StoreTestRequest;
use App\Http\Requests\H10\UpdateTestRequest;
use App\Models\Course;
use App\Models\Test;
use App\Support\H10\TestGrader;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Test wiedzy w kursie przypisanego prowadzącego — trasy `role:instructor`
 * w `routes/api/h10.php`. Zakres to dokładnie GET/POST/PATCH testu samego
 * kursu, bez banku pytań (ten zostaje wyłącznie w panelu administracji).
 * Reszta zachowania — w tym konflikt 409, gdy kurs ma już test — jest
 * wspólna z `AdminTestController`.
 */
class InstructorTestController extends Controller
{
    public function index(Request $request, Course $course): JsonResponse
    {
        $this->authorizeCourse($request, $course);

        /** @var Test|null $test */
        $test = $course->test;

        return response()->json(['data' => $this->present($test)]);
    }

    public function store(StoreTestRequest $request, Course $course): JsonResponse
    {
        $this->authorizeCourse($request, $course);

        if ($course->test()->exists()) {
            throw new ApiException(409, 'test_exists', 'Ten kurs ma już test.');
        }

        try {
            /** @var Test $test */
            $test = $course->test()->create($request->validated());
        } catch (UniqueConstraintViolationException) {
            throw new ApiException(409, 'test_exists', 'Ten kurs ma już test.');
        }

        $test->refresh();

        return response()->json(['data' => $this->present($test)], 201);
    }

    public function update(UpdateTestRequest $request, Test $test): JsonResponse
    {
        $course = $test->course()->withTrashed()->first();

        if ($course === null || $request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }

        $test->fill($request->validated());
        $test->save();
        $test->refresh();

        return response()->json(['data' => $this->present($test)]);
    }

    private function authorizeCourse(Request $request, Course $course): void
    {
        if ($request->user()->cannot('update', $course)) {
            throw new ApiException(403, 'forbidden', 'Nie jesteś przypisany do tego kursu.');
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function present(?Test $test): ?array
    {
        if ($test === null) {
            return null;
        }

        return [
            'id' => $test->id,
            'course_id' => $test->course_id,
            'pass_threshold' => $test->pass_threshold,
            'attempts_limit' => $test->attempts_limit,
            'question_count' => $test->question_count,
            'effective_pass_threshold' => TestGrader::passThreshold($test),
            'effective_attempts_limit' => TestGrader::attemptsLimit($test),
        ];
    }
}
