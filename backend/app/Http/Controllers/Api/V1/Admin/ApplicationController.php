<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H03\AcceptApplicationRequest;
use App\Http\Requests\H03\ImportApplicationsRequest;
use App\Http\Requests\H03\ListApplicationsRequest;
use App\Http\Requests\H03\RejectApplicationRequest;
use App\Http\Requests\H03\StoreApplicationRequest;
use App\Http\Requests\H03\ViewApplicationRequest;
use App\Http\Requests\H03\ViewDiplomaScanRequest;
use App\Http\Resources\H03\ApplicationResource;
use App\Models\Application;
use App\Services\H03\ApplicationAcceptor;
use App\Services\H03\ApplicationCsvImporter;
use App\Services\H03\ApplicationEmailNormalizer;
use App\Services\H03\ApplicationRejector;
use App\Services\H03\DiplomaScanAccess;
use App\Support\Settings;
use Illuminate\Http\JsonResponse;

class ApplicationController extends Controller
{
    public function index(ListApplicationsRequest $request): JsonResponse
    {
        $editionId = Settings::activeEdition()->id;
        $sort = $request->validated('sort', '-created_at');
        $descending = str_starts_with($sort, '-');
        $column = ltrim($sort, '-');
        $perPage = min(max((int) $request->validated('per_page', 25), 1), 100);

        $query = Application::query()->forEdition($editionId);

        if ($request->filled('status')) {
            $query->status($request->validated('status'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->validated('search'));
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('first_name', 'ilike', "%{$search}%")
                    ->orWhere('last_name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%");
            });
        }

        $query->orderBy($column, $descending ? 'desc' : 'asc')->orderBy('id');
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => ApplicationResource::collection($paginator->items())->resolve($request),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'edition_id' => $editionId,
                'filters' => [
                    'status' => $request->validated('status'),
                    'search' => $request->validated('search'),
                    'sort' => $sort,
                ],
            ],
        ]);
    }

    public function store(StoreApplicationRequest $request): JsonResponse
    {
        $data = $request->validated();
        $edition = Settings::activeEdition();

        if (isset($data['edition_id']) && (int) $data['edition_id'] !== $edition->id) {
            throw new ApiException(422, 'validation_failed', 'Można dodać zgłoszenie tylko do aktywnej edycji.', errors: [
                'edition_id' => ['Wybierz aktywną edycję.'],
            ]);
        }

        $email = ApplicationEmailNormalizer::normalize($data['email']);
        if (Application::query()->forEdition($edition)->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw new ApiException(409, 'application_already_exists', 'Zgłoszenie z tym adresem już istnieje w tej edycji.');
        }

        $application = Application::query()->create([
            ...$data,
            'edition_id' => $edition->id,
            'email' => $email,
            'role' => $data['role'] ?? 'volunteer',
            'status' => 'new',
        ]);

        return response()->json(['data' => ApplicationResource::make($application)->resolve($request)], 201);
    }

    public function show(ViewApplicationRequest $request, int $id): JsonResponse
    {
        $application = Application::query()
            ->forEdition(Settings::activeEdition())
            ->whereKey($id)
            ->first();

        if ($application === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zgłoszenia.');
        }

        return response()->json(['data' => ApplicationResource::make($application)->resolve($request)]);
    }

    public function accept(AcceptApplicationRequest $request, int $id): JsonResponse
    {
        $result = ApplicationAcceptor::accept(
            $id,
            $request->user(),
            $request->validated(),
        );

        return response()->json(['data' => $result], 201);
    }

    public function reject(RejectApplicationRequest $request, int $id): JsonResponse
    {
        $application = ApplicationRejector::reject(
            $id,
            $request->user(),
            trim((string) $request->validated('reason')),
        );

        return response()->json(['data' => ApplicationResource::make($application)->resolve($request)]);
    }

    public function import(ImportApplicationsRequest $request): JsonResponse
    {
        $result = ApplicationCsvImporter::import($request->file('file'), Settings::activeEdition());

        return response()->json(['data' => $result]);
    }

    public function diplomaScan(ViewDiplomaScanRequest $request, int $id)
    {
        $application = Application::query()
            ->forEdition(Settings::activeEdition())
            ->whereKey($id)
            ->first();

        if ($application === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zgłoszenia.');
        }

        $file = DiplomaScanAccess::open($application, $request->user());

        return response()->download($file['path'], $file['filename'], [
            'Content-Type' => $file['mime'],
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
