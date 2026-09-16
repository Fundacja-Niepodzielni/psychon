<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H10\StoreTestRequest;
use App\Http\Requests\H10\UpdateTestRequest;
use App\Models\Course;
use App\Models\Test;
use App\Support\H10\TestGrader;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H10 · Test wiedzy kursu — założenie i ustawienia z panelu administracji.
 *
 * GET   /admin/courses/{course}/tests  — test kursu (lub `null`, gdy jeszcze nie istnieje)
 * POST  /admin/courses/{course}/tests  — zakłada wiersz `tests` dla kursu (jeden na kurs)
 * PATCH /admin/tests/{test}            — zmiana progu zaliczenia, limitu podejść, liczby pytań
 */
class AdminTestController extends Controller
{
    public function index(Course $course): JsonResponse
    {
        return response()->json([
            'data' => $this->present($course->test),
        ]);
    }

    public function store(StoreTestRequest $request, Course $course): JsonResponse
    {
        if ($course->test()->exists()) {
            throw new ApiException(409, 'test_exists', 'Ten kurs ma już test.');
        }

        $test = $course->test()->create($request->validated());

        return response()->json(['data' => $this->present($test)], 201);
    }

    public function update(UpdateTestRequest $request, Test $test): JsonResponse
    {
        $test->fill($request->validated());
        $test->save();

        return response()->json(['data' => $this->present($test)]);
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
