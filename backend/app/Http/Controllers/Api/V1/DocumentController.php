<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H14\GenerateDocumentRequest;
use App\Http\Resources\DocumentResource;
use App\Models\Document;
use App\Services\H14\DocumentIssuer;
use App\Services\H14\DocumentTypeGate;
use App\Support\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * `GET /documents`, `POST /documents/generate`, `GET /documents/{document}/download`
 * (contract H14). All logic lives in App\Services\H14 — this controller only
 * authorizes, validates, and shapes the HTTP response.
 */
class DocumentController extends Controller
{
    public function index(Request $request): array
    {
        $user = $request->user();

        $documents = Document::query()
            ->where('user_id', $user->id)
            ->orderByDesc('generated_at')
            ->get();

        return [
            'data' => DocumentResource::collection($documents)->resolve(),
            'meta' => [
                'current_page' => 1,
                'per_page' => max($documents->count(), 1),
                'total' => $documents->count(),
                'last_page' => 1,
                'extra' => [
                    'available_types' => DocumentTypeGate::for($user),
                ],
            ],
        ];
    }

    public function generate(GenerateDocumentRequest $request): JsonResponse
    {
        $document = DocumentIssuer::issue($request->user(), $request->string('type')->value());

        return response()->json([
            'data' => DocumentResource::make($document)->resolve(),
        ], 201);
    }

    public function download(Request $request, Document $document): BinaryFileResponse
    {
        if ($request->user()->cannot('view', $document)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        // Demo/dev storage can be wiped between runs (design D7) — the
        // snapshot is the source of truth, so the file is just re-rendered.
        if ($document->pdf_path === null || ! Storage::disk('local')->exists($document->pdf_path)) {
            $path = PdfService::render(
                DocumentIssuer::viewFor($document->type),
                $document->data_snapshot ?? [],
            );
            $document->forceFill(['pdf_path' => $path])->save();
        }

        $extension = pathinfo($document->pdf_path, PATHINFO_EXTENSION) ?: 'html';
        $filename = Str::slug($document->number).'.'.$extension;

        return response()->download(
            Storage::disk('local')->path($document->pdf_path),
            $filename,
            ['Content-Type' => Storage::disk('local')->mimeType($document->pdf_path) ?: 'text/html'],
        );
    }
}
