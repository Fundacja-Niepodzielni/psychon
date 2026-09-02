<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\H01\UpdateProfileRequest;
use App\Http\Resources\DataExportResource;
use App\Http\Resources\ProfileResource;
use App\Jobs\GenerateDataExport;
use App\Models\DataExport;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H01 · Profil użytkownika i eksport RODO.
 *
 * GET  /me                          — full self-profile (owner sees own PESEL)
 * PATCH /me                         — profile fields; `email` is read-only
 * POST /me/exports                  — queue a RODO data export (202)
 * GET  /me/exports/{export}         — export status
 * GET  /me/exports/{export}/download — download the finished file
 */
class ProfileController extends Controller
{
    public function show(Request $request): ProfileResource
    {
        return new ProfileResource($request->user()->load('consents'));
    }

    public function update(UpdateProfileRequest $request): ProfileResource
    {
        $user = $request->user();
        $data = $request->validated();

        foreach (['first_name', 'last_name', 'phone', 'pesel'] as $field) {
            if (array_key_exists($field, $data)) {
                $user->{$field} = $data[$field];
            }
        }

        if (array_key_exists('address', $data)) {
            $this->mergeAddress($user, $data['address'] ?? []);
        }

        $user->save();

        return new ProfileResource($user->fresh()->load('consents'));
    }

    public function storeExport(Request $request): JsonResponse
    {
        $export = DataExport::create(['user_id' => $request->user()->id]);

        GenerateDataExport::dispatch($export->id);

        return (new DataExportResource($export))
            ->response()
            ->setStatusCode(202);
    }

    public function showExport(Request $request, string $export): JsonResource
    {
        return new DataExportResource($this->ownExportOrFail($request, $export));
    }

    public function downloadExport(Request $request, string $export): StreamedResponse
    {
        $record = $this->ownExportOrFail($request, $export);

        $disk = Storage::disk('local');

        abort_unless(
            $record->status === 'ready'
                && $record->file_path !== null
                && $disk->exists($record->file_path),
            404,
        );

        return $disk->download(
            $record->file_path,
            "moje-dane-{$record->public_id}.json",
            ['Content-Type' => 'application/json'],
        );
    }

    /**
     * PATCH scala adres, nie zastępuje go. Podklucz nieobecny w żądaniu
     * zostaje bez zmian; podklucz przysłany jawnie jako `null` zeruje
     * wyłącznie swoje pole. Wcześniej każdy PATCH jednego podklucza kasował
     * dwa pozostałe, bo brak klucza i jawny `null` były nierozróżnialne.
     *
     * @param  array<string, mixed>  $address
     */
    private function mergeAddress(User $user, array $address): void
    {
        $columns = [
            'street' => 'address_street',
            'city' => 'address_city',
            'zip' => 'address_zip',
        ];

        foreach ($columns as $key => $column) {
            if (array_key_exists($key, $address)) {
                $user->{$column} = $address[$key];
            }
        }
    }

    /**
     * Look up an export by its public id, scoped to the caller. A stranger's
     * id is indistinguishable from a missing one — both 404 (contract §1.1).
     */
    private function ownExportOrFail(Request $request, string $publicId): DataExport
    {
        return DataExport::query()
            ->where('public_id', $publicId)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();
    }
}
