<?php

namespace App\Http\Controllers\Api\V1\H22;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H22\StoreLegalDocumentVersionRequest;
use App\Http\Requests\H22\UpdateLegalDocumentVersionRequest;
use App\Http\Resources\H22\LegalDocumentVersionResource;
use App\Models\LegalDocumentVersion;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H22 · Dokumenty prawne — administracja (rola: matryca uprawnień,
 * wiersz „Panel: CMS kursów i lekcji" — docs/system/03-role-i-uprawnienia.md
 * — najbliższy odpowiednik dla zarządzania treścią; ta sama bramka co inne
 * panele CMS, `role:project_manager,super_admin`,
 * backend/app/Http/Middleware/EnsureRole.php).
 */
class AdminLegalDocumentController extends Controller
{
    public function index(Request $request, string $type): JsonResponse
    {
        $this->assertKnownType($type);

        $versions = LegalDocumentVersion::query()
            ->ofType($type)
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => LegalDocumentVersionResource::collection($versions)->resolve($request),
        ]);
    }

    public function store(StoreLegalDocumentVersionRequest $request, string $type): JsonResponse
    {
        $this->assertKnownType($type);

        $document = LegalDocumentVersion::create([
            'type' => $type,
            'version' => $request->string('version')->value(),
            'content' => $request->string('content')->value(),
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        return response()->json([
            'data' => LegalDocumentVersionResource::make($document)->resolve($request),
        ], 201);
    }

    public function update(UpdateLegalDocumentVersionRequest $request, string $type, string $version): JsonResponse
    {
        $this->assertKnownType($type);

        $document = $this->findOrFail($type, $version);
        $this->assertDraft($document, 'edycji');

        $document->fill($request->validated());
        $document->save();

        return response()->json([
            'data' => LegalDocumentVersionResource::make($document)->resolve($request),
        ]);
    }

    public function destroy(Request $request, string $type, string $version): JsonResponse
    {
        $this->assertKnownType($type);

        $document = $this->findOrFail($type, $version);
        $this->assertDraft($document, 'usunięcia');

        $document->delete();

        return response()->json([
            'data' => ['type' => $type, 'version' => $version, 'deleted' => true],
        ]);
    }

    public function publish(Request $request, string $type, string $version): JsonResponse
    {
        $this->assertKnownType($type);

        $document = $this->findOrFail($type, $version);

        if ($document->isPublished()) {
            throw new ApiException(403, 'version_locked', 'Ta wersja jest już opublikowana.');
        }

        $document->forceFill([
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now(),
        ])->save();

        AuditLog::record($request->user(), 'legal_document.published', $document, [
            'type' => $type,
            'version' => $document->version,
        ]);

        return response()->json([
            'data' => LegalDocumentVersionResource::make($document)->resolve($request),
        ]);
    }

    private function findOrFail(string $type, string $version): LegalDocumentVersion
    {
        return LegalDocumentVersion::query()
            ->ofType($type)
            ->where('version', $version)
            ->firstOrFail();
    }

    private function assertDraft(LegalDocumentVersion $document, string $akcja): void
    {
        if ($document->isPublished()) {
            throw new ApiException(403, 'version_locked', "Opublikowanej wersji nie można poddać {$akcja}.");
        }
    }

    private function assertKnownType(string $type): void
    {
        if (! in_array($type, LegalDocumentVersion::TYPES, true)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }
    }
}
