<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Jobs\GenerateCertificate;
use App\Models\Certificate;
use App\Support\H13\CertificateConditions;
use App\Support\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H13 · Certyfikaty — strona uczestnika.
 *
 * GET  /certificate/conditions — cztery warunki ukończenia programu
 * POST /certificate/generate   — wydanie certyfikatu (202 job) albo 422 z brakami
 * GET  /certificate/download   — pobranie własnego wydanego certyfikatu
 */
class CertificateController extends Controller
{
    public function conditions(Request $request): JsonResponse
    {
        return response()->json([
            'data' => CertificateConditions::for($request->user())->toArray(),
        ]);
    }

    public function generate(Request $request): JsonResponse
    {
        $conditions = CertificateConditions::for($request->user());

        if (! $conditions->eligible()) {
            throw new ApiException(
                422,
                'conditions_not_met',
                'Nie wszystkie warunki ukończenia programu są spełnione.',
                reason: ['missing' => $conditions->missing()],
            );
        }

        GenerateCertificate::dispatch($request->user()->id);

        return response()->json(['data' => ['status' => 'queued']], 202);
    }

    public function download(Request $request): StreamedResponse
    {
        $certificate = Certificate::query()
            ->where('user_id', $request->user()->id)
            ->where('edition_id', Settings::activeEdition()->id)
            ->latest('issued_at')
            ->first();

        $disk = Storage::disk('local');

        abort_unless(
            $certificate !== null
                && $certificate->pdf_path !== null
                && $disk->exists($certificate->pdf_path),
            404,
        );

        return $disk->download(
            $certificate->pdf_path,
            'certyfikat-'.str_replace('/', '-', $certificate->number).'.html',
        );
    }
}
