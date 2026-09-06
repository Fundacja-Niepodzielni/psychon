<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H19\UpdateEditionRequest;
use App\Http\Resources\EditionResource;
use App\Services\H19\EditionSettingsUpdater;
use App\Support\Settings;

/**
 * Pakiet H19 · GET/PATCH /admin/edition — ustawienia aktywnej edycji.
 * MVP prowadzi jedną edycję naraz, więc trasa nie przyjmuje identyfikatora.
 */
class EditionSettingsController extends Controller
{
    public function show(): EditionResource
    {
        return new EditionResource(Settings::activeEdition());
    }

    public function update(UpdateEditionRequest $request): EditionResource
    {
        $edition = EditionSettingsUpdater::update(
            Settings::activeEdition(),
            $request->validated(),
            $request->user(),
        );

        return new EditionResource($edition);
    }
}
