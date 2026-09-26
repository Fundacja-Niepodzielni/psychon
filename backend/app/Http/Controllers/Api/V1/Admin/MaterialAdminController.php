<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\RespondsWithMaterial;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\StoreMaterialRequest;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Material;
use App\Services\H08\MaterialStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H08b · wgrywanie i usuwanie materiałów w panelu administracji.
 * Wszystkie trasy za `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * Pobierania tu nie ma: `GET /materials/{material}/download` wraz z podpisem
 * i re-sprawdzaniem dostępu w chwili pobrania należy do H05.
 */
class MaterialAdminController extends Controller
{
    use RespondsWithMaterial;

    public function storeForLesson(StoreMaterialRequest $request, Lesson $lesson): JsonResponse
    {
        return $this->storeMaterialForLesson($request, $lesson);
    }

    public function storeForCourse(StoreMaterialRequest $request, Course $course): JsonResponse
    {
        return $this->storeMaterialForCourse($request, $course);
    }

    public function destroy(Request $request, Material $material): JsonResponse
    {
        MaterialStore::delete($material, $request->user());

        return response()->json([
            'data' => ['id' => $material->id, 'deleted' => true],
        ]);
    }
}
