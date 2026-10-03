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
 * Odczyt listy materiałów lekcji (`GET /admin/lessons/{lesson}/materials`)
 * niczego nie zapisuje, nie audytuje i nie powiadamia.
 *
 * Pobierania tu nie ma: `GET /materials/{material}/download` wraz z podpisem
 * i re-sprawdzaniem dostępu w chwili pobrania należy do H05.
 */
class MaterialAdminController extends Controller
{
    use RespondsWithMaterial;

    /**
     * Żywe materiały jednej lekcji, od najstarszego. Parametr trasy jest liczbą
     * bez wiązania modelu, więc rolę rozstrzyga `role:` zanim cokolwiek zostanie
     * odczytane z bazy; nieznana albo miękko usunięta lekcja to 404 (`firstOrFail`
     * na modelu z `SoftDeletes`). Parametry query są ignorowane. Materiały wpięte
     * w kurs i materiały innych lekcji nie wchodzą (`where lesson_id`).
     */
    public function indexForLesson(Request $request, string $lesson): JsonResponse
    {
        // Liczba poza zakresem całkowitym nie jest identyfikatorem żadnej lekcji
        // (inaczej baza odpowiedziałaby błędem zakresu, czyli 500).
        $id = filter_var($lesson, FILTER_VALIDATE_INT);
        abort_if($id === false, 404);

        $lessonId = Lesson::query()->whereKey($id)->firstOrFail()->id;

        return $this->lessonMaterialsResponse($request, $lessonId);
    }

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
