<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H20\AuditIndexRequest;
use App\Http\Resources\AuditLogEntryResource;
use App\Queries\AdminAuditQuery;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H20 · GET /admin/audit (+ /export.csv) — dziennik działań,
 * wyłącznie do odczytu. Kontrakt §2: trasy modyfikacji audytu nie istnieją
 * (żadna nie jest tu rejestrowana — próba PATCH/DELETE zwraca 404).
 */
class AuditController extends Controller
{
    public function index(AuditIndexRequest $request): JsonResponse
    {
        $paginator = AdminAuditQuery::fromRequest($request)
            ->paginate(AdminAuditQuery::perPage($request));

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn ($entry) => AuditLogEntryResource::make($entry)->resolve($request))
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

    /**
     * Eksport dziennika — te same filtry co lista, wspólny helper `Csv`.
     */
    public function export(AuditIndexRequest $request): StreamedResponse
    {
        $entries = AdminAuditQuery::fromRequest($request)->get();

        $rows = [AuditLogEntryResource::FIELDS];

        foreach ($entries as $entry) {
            $rows[] = AuditLogEntryResource::make($entry)->toCsvRow($request);
        }

        return Csv::download('dziennik.csv', $rows);
    }
}
