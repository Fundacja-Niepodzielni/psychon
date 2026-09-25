<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H20\ReportClosingRequest;
use App\Http\Requests\H20\ReportIndexRequest;
use App\Services\H20\ReportSummary;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H20 · GET /admin/report (+ /admin/reports, /export.csv, /closing)
 * — raport edycji. Opcjonalny zakres dat `from`/`to` (walidacja w
 * `ReportIndexRequest`). `/admin/reports` to alias `/admin/report` — sama
 * nazwa z kontraktu API (§ opis PR), trasa `show()` bez zmian, dodana
 * obok istniejącej (wstecznie kompatybilnie, nic nie usunięte).
 */
class ReportController extends Controller
{
    public function show(ReportIndexRequest $request): JsonResponse
    {
        return response()->json([
            'data' => ReportSummary::build($request->query('from'), $request->query('to')),
        ]);
    }

    /**
     * Raport zamknięcia wskazanej edycji — `edition` wymagany
     * (`ReportClosingRequest`), osobne działanie od `show()`.
     */
    public function closing(ReportClosingRequest $request): JsonResponse
    {
        return response()->json([
            'data' => ReportSummary::closing((int) $request->query('edition')),
        ]);
    }

    /**
     * Eksport zestawienia imiennego — ten sam wspólny helper `Csv` co dziennik.
     */
    public function export(ReportIndexRequest $request): StreamedResponse
    {
        $rows = [['id', 'first_name', 'last_name', 'role', 'hours_accepted', 'consultations', 'certificate_issued']];

        foreach (ReportSummary::people($request->query('from'), $request->query('to')) as $person) {
            $rows[] = [
                $person['id'],
                $person['first_name'],
                $person['last_name'],
                $person['role'],
                $person['hours_accepted'],
                $person['consultations'],
                $person['certificate_issued'] ? '1' : '0',
            ];
        }

        return Csv::download('raport.csv', $rows);
    }
}
