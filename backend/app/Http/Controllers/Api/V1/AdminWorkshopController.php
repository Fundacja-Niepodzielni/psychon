<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WorkshopCompletion;
use App\Support\AuditLog;
use App\Support\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pakiet H10 · Warsztat stacjonarny — odznaczenie zaliczenia przez administrację.
 *
 * POST /admin/workshop/{user}/complete → 200 [audyt `workshop.completed`]
 *
 * Zasila warunek certyfikatu `workshop` (H13) przez `ProgressAggregator`.
 */
class AdminWorkshopController extends Controller
{
    public function store(Request $request, User $user): JsonResponse
    {
        $edition = Settings::activeEdition();

        $completion = WorkshopCompletion::firstOrCreate(
            ['user_id' => $user->id, 'edition_id' => $edition->id],
            ['completed_at' => now(), 'marked_by' => $request->user()->id],
        );

        if ($completion->wasRecentlyCreated) {
            AuditLog::record($request->user(), 'workshop.completed', $user, [
                'edition_id' => $edition->id,
            ]);
        }

        return response()->json(['data' => [
            'user_id' => $user->id,
            'edition_id' => $edition->id,
            'completed_at' => $completion->completed_at?->toIso8601ZuluString(),
            'workshop_done' => true,
        ]]);
    }
}
