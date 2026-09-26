<?php

namespace App\Http\Controllers\Concerns;

use App\Http\Resources\H08\AdminLessonResource;
use App\Models\Lesson;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Odpowiedź zasobu lekcji — wspólna dla panelu administracji i
 * prowadzącego (`LessonAdminController`, `InstructorLessonController`).
 * `refresh()` przed serializacją, bo kolumny z domyślną wartością bazy
 * (`duration_seconds`) nie trafiają do modelu przy zapisie — bez odczytu
 * odpowiedź na `POST` pokazałaby `null` zamiast zapisanego `0`.
 */
trait RespondsWithLesson
{
    private function resourceResponse(Request $request, Lesson $lesson, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => AdminLessonResource::make($lesson->refresh()->loadCount('materials'))->resolve($request),
        ], $status);
    }
}
