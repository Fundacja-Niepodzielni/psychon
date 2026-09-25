<?php

namespace App\Http\Controllers\Api\V1\H11;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H11\StoreInternshipFormRequest;
use App\Http\Requests\H11\UpdateInternshipFormRequest;
use App\Http\Resources\H11\InternshipFormResource;
use App\Models\InternshipForm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Internship form dictionary for administration. There is no delete: an item
 * is retired with `is_active = false`.
 */
class AdminInternshipFormController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $forms = InternshipForm::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (InternshipForm $form): array => InternshipFormResource::make($form)->resolve($request))
            ->all();

        return response()->json(['data' => $forms]);
    }

    public function store(StoreInternshipFormRequest $request): JsonResponse
    {
        $form = InternshipForm::query()->create($request->validated());

        return response()->json([
            'data' => InternshipFormResource::make($form->refresh())->resolve($request),
        ], 201);
    }

    public function update(UpdateInternshipFormRequest $request, int $id): JsonResponse
    {
        $form = InternshipForm::query()->find($id);

        if ($form === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono formy stażu.');
        }

        $form->fill($request->validated())->save();

        return response()->json([
            'data' => InternshipFormResource::make($form)->resolve($request),
        ]);
    }
}
