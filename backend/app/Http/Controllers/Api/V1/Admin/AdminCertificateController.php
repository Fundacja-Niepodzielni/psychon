<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H13\RevokeCertificateRequest;
use App\Http\Resources\AdminCertificateResource;
use App\Models\Certificate;
use App\Queries\AdminCertificateQuery;
use App\Services\H13\CertificateRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H13 · Panel — lista wydanych certyfikatów i ich unieważnianie.
 * Wszystkie trasy za `role:project_manager,super_admin` (routes/api/h13.php).
 *
 * GET  /admin/certificates                    — lista wydanych, filtr po numerze i po osobie
 * POST /admin/certificates/{certificate}/revoke — unieważnienie z powodem
 */
class AdminCertificateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = AdminCertificateQuery::fromRequest($request)
            ->paginate(AdminCertificateQuery::perPage($request));

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (Certificate $certificate): array => AdminCertificateResource::make($certificate)->resolve($request))
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

    public function revoke(RevokeCertificateRequest $request, Certificate $certificate): JsonResponse
    {
        $revoked = CertificateRevoker::revoke($certificate, $request->user(), $request->validated('reason'));

        return response()->json([
            'data' => AdminCertificateResource::make($revoked->load(['user', 'edition']))->resolve($request),
        ]);
    }
}
