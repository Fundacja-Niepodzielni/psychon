<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H08\StoreCourseRequest;
use App\Http\Requests\H08\UpdateCourseRequest;
use App\Http\Resources\H08\AdminCourseResource;
use App\Models\Course;
use App\Services\H08\CourseWriter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H08 · CRUD kursów w panelu administracji. Wszystkie trasy za
 * `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * Lista buduje własne zapytanie zamiast `CourseCatalogQuery`: ta filtruje po
 * `is_published`, a panel musi widzieć również szkice (i należy do H05).
 * Reguły domenowe i audyt żyją w `CourseWriter`.
 */
class CourseCatalogAdminController extends Controller
{
    /** Kolumny dopuszczone w parametrze `sort`. */
    private const array SORTABLE = ['sequence_order', 'title', 'created_at'];

    public function index(Request $request): JsonResponse
    {
        $paginator = $this->listQuery($request)->paginate($this->perPage($request));

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (Course $course): array => AdminCourseResource::make($course)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, Course $course): JsonResponse
    {
        return $this->resourceResponse($request, $course);
    }

    public function store(StoreCourseRequest $request): JsonResponse
    {
        $course = CourseWriter::create($request->validated(), $request->user());

        return $this->resourceResponse($request, $course, 201);
    }

    public function update(UpdateCourseRequest $request, Course $course): JsonResponse
    {
        $course = CourseWriter::update($course, $request->validated(), $request->user());

        return $this->resourceResponse($request, $course);
    }

    public function destroy(Request $request, Course $course): JsonResponse
    {
        CourseWriter::delete($course, $request->user());

        return response()->json([
            'data' => ['id' => $course->id, 'deleted' => true],
        ]);
    }

    private function resourceResponse(Request $request, Course $course, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => AdminCourseResource::make($course->loadCount(['lessons', 'materials']))->resolve($request),
        ], $status);
    }

    private function listQuery(Request $request): Builder
    {
        $query = Course::query()->withCount(['lessons', 'materials']);

        if (($type = trim((string) $request->query('type', ''))) !== '') {
            $query->where('type', $type);
        }

        if (($productGroup = trim((string) $request->query('product_group', ''))) !== '') {
            $query->where('product_group', $productGroup);
        }

        if (($search = trim((string) $request->query('search', ''))) !== '') {
            $term = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';

            $query->where(function (Builder $q) use ($term): void {
                $q->where('title', 'ilike', $term)
                    ->orWhere('slug', 'ilike', $term);
            });
        }

        return $this->applySort($query, (string) $request->query('sort', 'sequence_order'));
    }

    /**
     * Domyślnie porządek ścieżki: kursy spoza sekwencji (`sequence_order`
     * null) lądują na końcu, tak samo jak w katalogu uczestnika.
     */
    private function applySort(Builder $query, string $sort): Builder
    {
        $sort = trim($sort) !== '' ? trim($sort) : 'sequence_order';
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $column = ltrim($sort, '-');

        if (! in_array($column, self::SORTABLE, true)) {
            $column = 'sequence_order';
            $direction = 'asc';
        }

        if ($column === 'sequence_order') {
            $query->orderByRaw('sequence_order '.$direction.' nulls last');
        } else {
            $query->orderBy($column, $direction);
        }

        return $query->orderBy('id', 'asc');
    }

    private function perPage(Request $request): int
    {
        return min(max((int) $request->integer('per_page', 25), 1), 100);
    }
}
