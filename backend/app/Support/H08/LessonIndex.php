<?php

namespace App\Support\H08;

use App\Http\Resources\H08\AdminLessonResource;
use App\Models\Course;
use App\Models\Lesson;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H08 · lista lekcji kursu z liczbą materiałów — wspólna dla panelu
 * administracji i prowadzącego (`LessonAdminController`,
 * `InstructorLessonController`): oba czytają dokładnie tę samą kolekcję w
 * ten sam sposób, różnią się wyłącznie sprawdzeniem dostępu PRZED
 * wywołaniem tej metody.
 */
final class LessonIndex
{
    public static function response(Course $course, Request $request): JsonResponse
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
}
