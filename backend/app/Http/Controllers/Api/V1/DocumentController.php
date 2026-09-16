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
use Illuminate\Http\Response;
use Illuminate\Support\Str;

/**
 * `GET /documents`, `POST /documents/generate`, `GET /documents/{document:public_id}/download`
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

    public function download(Request $request, Document $document): Response
    {
        // Właścicielka dokumentu albo administracja (DocumentPolicy) — nie
        // ma już powodu udawać "nie znaleziono" (404): adres niesie losowy
        // `public_id`, nie kolejny numer wiersza, więc nie da się go
        // zgadnąć, a 403 niczego ponad to nie ujawnia.
        if ($request->user()->cannot('view', $document)) {
            throw new ApiException(403, 'forbidden', 'Brak dostępu do tego dokumentu.');
        }

        // Bez pliku w magazynie (U-D): PDF powstaje tu i teraz, z
        // zaszyfrowanej migawki, i nigdy nie trafia na dysk — trafia od
        // razu do odpowiedzi HTTP.
        $bytes = PdfService::renderBytes(
            DocumentIssuer::viewFor($document->type),
            $document->data_snapshot ?? [],
        );

        $filename = Str::slug($document->number).'.pdf';

        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }
}
