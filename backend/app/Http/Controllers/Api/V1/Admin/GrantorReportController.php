<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H20\GrantorReportIndexRequest;
use App\Services\H20\GrantorReportAggregates;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * `GET /admin/report/grantor` (+ `/export.csv`) - raport w ukladzie
 * grantodawcy: wylacznie liczby zbiorcze (`GrantorReportAggregates`), zero
 * wierszy osob w obu odpowiedziach. Ten sam wzorzec co
 * `ReportController::show/export` (ten sam pakiet H20): jedno zrodlo liczb,
 * dwie trasy (JSON, CSV) nad nim.
 */
class GrantorReportController extends Controller
{
    public function show(GrantorReportIndexRequest $request): JsonResponse
    {
        $from = $request->query('from');
        $to = $request->query('to');

        return response()->json([
            'data' => [
                'period' => ['from' => $from, 'to' => $to],
                'indicators' => GrantorReportAggregates::build($from, $to),
            ],
        ]);
    }

    public function export(GrantorReportIndexRequest $request): StreamedResponse
    {
        $indicators = GrantorReportAggregates::build($request->query('from'), $request->query('to'));

        $rows = [['wskaznik', 'wartosc']];

        foreach (self::flatten($indicators) as $key => $value) {
            $rows[] = [$key, $value];
        }

        return Csv::download('raport-grantodawcy.csv', $rows);
    }

    /**
     * Splaszczenie zagniezdzonego `participants_by_status` do wierszy
     * `wskaznik;wartosc` (kropka jako separator poziomow) - jeden plaski
     * ksztalt dla CSV, bez drugiej definicji tych samych liczb.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private static function flatten(array $values, string $prefix = ''): array
    {
        $flat = [];

        foreach ($values as $key => $value) {
            $label = $prefix === '' ? (string) $key : $prefix.'.'.$key;

            if (is_array($value)) {
                $flat += self::flatten($value, $label);

                continue;
            }

            $flat[$label] = $value;
        }

        return $flat;
    }
}
