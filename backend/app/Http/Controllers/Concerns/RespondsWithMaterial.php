<?php

namespace App\Http\Controllers\Concerns;

use App\Http\Requests\H08\StoreMaterialRequest;
use App\Http\Resources\H08\AdminMaterialResource;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Material;
use App\Services\H08\MaterialStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

/**
 * Zapis i odpowiedź materiału — wspólne dla panelu administracji i
 * prowadzącego (`MaterialAdminController`, `InstructorMaterialController`):
 * oba wołają `MaterialStore` z tym samym plikiem i tą samą odpowiedzią,
 * różnią się wyłącznie sprawdzeniem dostępu PRZED zapisem, które robi
 * klasa korzystająca przed wywołaniem tych metod.
 * `StoreInstructorMaterialRequest extends StoreMaterialRequest`, więc
 * podtyp przechodzi tu bez rzutowania.
 */
trait RespondsWithMaterial
{
    /** Twardy limit pozycji w zapytaniu do bazy: lista nie jest stronicowana. */
    private const int LESSON_LIST_LIMIT = 200;

    private function storeMaterialForLesson(StoreMaterialRequest $request, Lesson $lesson): JsonResponse
    {
        $material = MaterialStore::forLesson(
            $lesson,
            $this->uploadedFile($request),
            $request->validated('name'),
            $request->user(),
        );

        return $this->resourceResponse($request, $material);
    }

    private function storeMaterialForCourse(StoreMaterialRequest $request, Course $course): JsonResponse
    {
        $material = MaterialStore::forCourse(
            $course,
            $this->uploadedFile($request),
            $request->validated('name'),
            $request->user(),
        );

        return $this->resourceResponse($request, $material);
    }

    /** Reguła `required|file` przepuszcza wyłącznie pojedynczy wgrany plik. */
    private function uploadedFile(StoreMaterialRequest $request): UploadedFile
    {
        /** @var UploadedFile $file */
        $file = $request->file('file');

        return $file;
    }

    /**
     * Żywe materiały jednej lekcji, od najstarszego, najwyżej 200 (lista nie
     * jest stronicowana, limit stoi w zapytaniu do bazy). Ten sam kształt
     * w panelu administracji i prowadzącego; dostęp sprawdza klasa
     * korzystająca przed wywołaniem.
     */
    private function lessonMaterialsResponse(Request $request, int $lessonId): JsonResponse
    {
        $materials = Material::query()
            ->where('lesson_id', $lessonId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(self::LESSON_LIST_LIMIT)
            ->get();

        return response()->json([
            'data' => AdminMaterialResource::collection($materials)->resolve($request),
        ]);
    }

    private function resourceResponse(Request $request, Material $material): JsonResponse
    {
        return response()->json([
            'data' => AdminMaterialResource::make($material)->resolve($request),
        ], 201);
    }
}
