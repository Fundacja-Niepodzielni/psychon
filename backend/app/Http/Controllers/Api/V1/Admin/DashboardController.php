<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\H19\DashboardSummary;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H19 · GET /admin/dashboard — liczniki i kolejki spraw.
 */
class DashboardController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => DashboardSummary::build()]);
    }
}
