<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\DocumentTemplates\UpdateDocumentTemplateRequest;
use App\Http\Resources\DocumentTemplateResource;
use App\Http\Resources\DocumentTemplateVersionResource;
use App\Models\DocumentTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Edytor wzorow dokumentow (zaplecze) - GET/PUT `/document-templates/{type}`,
 * GET `/document-templates/{type}/versions`. Wszystkie trasy za
 * `role:project_manager,super_admin` (routes/api/document_templates.php).
 */
class DocumentTemplateController extends Controller
{
    public function show(Request $request, string $type): JsonResponse
    {
        $template = $this->findOrFail($type);

        return response()->json([
            'data' => DocumentTemplateResource::make($template)->resolve($request),
        ]);
    }

    public function update(UpdateDocumentTemplateRequest $request, string $type): JsonResponse
    {
        $template = $this->findOrFail($type);

        $template = DB::transaction(function () use ($template, $request): DocumentTemplate {
            $template->content = $request->string('content')->value();
            $template->version += 1;
            $template->updated_by = $request->user()->id;
            $template->save();

            $template->versions()->create([
                'type' => $template->type,
                'content' => $template->content,
                'version' => $template->version,
                'updated_by' => $template->updated_by,
            ]);

            return $template;
        });

        return response()->json([
            'data' => DocumentTemplateResource::make($template)->resolve($request),
        ]);
    }

    public function versions(Request $request, string $type): JsonResponse
    {
        $template = $this->findOrFail($type);

        $versions = $template->versions()->orderByDesc('version')->get();

        return response()->json([
            'data' => DocumentTemplateVersionResource::collection($versions)->resolve($request),
        ]);
    }

    private function findOrFail(string $type): DocumentTemplate
    {
        if (! in_array($type, DocumentTemplate::TYPES, true)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        $template = DocumentTemplate::query()->where('type', $type)->first();

        if ($template === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        return $template;
    }
}
