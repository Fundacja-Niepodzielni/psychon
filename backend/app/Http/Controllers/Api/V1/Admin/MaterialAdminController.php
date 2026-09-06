<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
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
 * Pakiet H08b · wgrywanie i usuwanie materiałów w panelu administracji.
 * Wszystkie trasy za `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * Pobierania tu nie ma: `GET /materials/{material}/download` wraz z podpisem
 * i re-sprawdzaniem dostępu w chwili pobrania należy do H05.
 */
class MaterialAdminController extends Controller
{
    public function storeForLesson(StoreMaterialRequest $request, Lesson $lesson): JsonResponse
    {
        $material = MaterialStore::forLesson(
            $lesson,
            $this->uploadedFile($request),
            $request->validated('name'),
            $request->user(),
        );

        return $this->resourceResponse($request, $material);
    }

    public function storeForCourse(StoreMaterialRequest $request, Course $course): JsonResponse
    {
        $material = MaterialStore::forCourse(
            $course,
            $this->uploadedFile($request),
            $request->validated('name'),
            $request->user(),
        );

        return $this->resourceResponse($request, $material);
    }

    public function destroy(Request $request, Material $material): JsonResponse
    {
        MaterialStore::delete($material, $request->user());

        return response()->json([
            'data' => ['id' => $material->id, 'deleted' => true],
        ]);
    }

    /** Reguła `required|file` przepuszcza wyłącznie pojedynczy wgrany plik. */
    private function uploadedFile(StoreMaterialRequest $request): UploadedFile
    {
        /** @var UploadedFile $file */
        $file = $request->file('file');

        return $file;
    }

    private function resourceResponse(Request $request, Material $material): JsonResponse
    {
        return response()->json([
            'data' => AdminMaterialResource::make($material)->resolve($request),
        ], 201);
    }
}
