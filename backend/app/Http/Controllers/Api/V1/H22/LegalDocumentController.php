<?php

namespace App\Http\Controllers\Api\V1\H22;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H22\AcceptLegalDocumentRequest;
use App\Http\Resources\H22\PublicLegalDocumentResource;
use App\Models\Consent;
use App\Models\LegalDocumentVersion;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H22 · Dokumenty prawne — odczyty publiczne i akceptacja.
 */
class LegalDocumentController extends Controller
{
    public function current(Request $request, string $type): JsonResponse
    {
        $this->assertKnownType($type);

        $current = LegalDocumentVersion::current($type);

        if ($current === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        return response()->json([
            'data' => PublicLegalDocumentResource::make($current)->resolve($request),
        ]);
    }

    public function show(Request $request, string $type, string $version): JsonResponse
    {
        $this->assertKnownType($type);

        $document = LegalDocumentVersion::query()
            ->ofType($type)
            ->where('version', $version)
            ->published()
            ->first();

        if ($document === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        return response()->json([
            'data' => PublicLegalDocumentResource::make($document)->resolve($request),
        ]);
    }

    /**
     * Akceptacja WYŁĄCZNIE bieżącej wersji: `version` w żądaniu musi
     * zgadzać się z wersją aktualnie opublikowaną. Ponowna akceptacja tej
     * samej (nadal bieżącej) wersji nie tworzy duplikatu — zwraca istniejący
     * wpis.
     */
    public function accept(AcceptLegalDocumentRequest $request, string $type): JsonResponse
    {
        if (! in_array($type, LegalDocumentVersion::TYPES, true)) {
            throw new ApiException(422, 'unknown_document_type', 'Nieznany rodzaj dokumentu.', errors: [
                'type' => ['Nieznany rodzaj dokumentu.'],
            ]);
        }

        $user = $request->user();
        $current = LegalDocumentVersion::current($type);
        $requestedVersion = $request->string('version')->value();

        if ($current === null || $current->version !== $requestedVersion) {
            throw new ApiException(
                422,
                'document_version_not_current',
                'Ta wersja nie jest już bieżąca. Odśwież dokument i zaakceptuj aktualną wersję.',
                errors: ['version' => ['Ta wersja nie jest już bieżąca.']],
                reason: ['current_version' => $current?->version],
            );
        }

        $consent = DB::transaction(function () use ($user, $type, $current): Consent {
            $existing = Consent::query()
                ->where('user_id', $user->id)
                ->where('type', $type)
                ->where('document_version', $current->version)
                ->whereNull('withdrawn_at')
                ->first();

            if ($existing !== null) {
                return $existing;
            }

            $consent = Consent::create([
                'user_id' => $user->id,
                'type' => $type,
                'document_version' => $current->version,
                'granted_at' => now(),
            ]);

            AuditLog::record($user, 'legal_document.accepted', $current, [
                'type' => $type,
                'version' => $current->version,
            ]);

            return $consent;
        });

        return response()->json([
            'data' => [
                'type' => $consent->type,
                'document_version' => $consent->document_version,
            ],
        ], $consent->wasRecentlyCreated ? 201 : 200);
    }

    private function assertKnownType(string $type): void
    {
        if (! in_array($type, LegalDocumentVersion::TYPES, true)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }
    }
}
