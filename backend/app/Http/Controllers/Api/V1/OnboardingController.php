<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\H21\UpdateOnboardingRequest;
use App\Models\Setting;
use App\Support\OnboardingContent;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H21 · Onboarding „Zacznij tutaj".
 *
 * GET   /onboarding        — treść ekranu; dostępna dla każdej zalogowanej roli,
 *                            bez bramki `access.active` (działa po wygaśnięciu
 *                            dostępu i po ukończeniu programu — kryterium 2).
 * PATCH /admin/onboarding   — edycja treści przez administrację (role gate).
 *
 * Bez audytu: rejestr §3.2 kontraktu nie przewiduje sluga dla onboardingu.
 */
class OnboardingController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->payload()]);
    }

    public function update(UpdateOnboardingRequest $request): JsonResponse
    {
        OnboardingContent::put($request->validated());

        return response()->json(['data' => $this->payload()]);
    }

    /**
     * Treść trzech sekcji + znacznik ostatniej edycji (null, gdy nietknięte).
     *
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        $row = Setting::query()->where('key', OnboardingContent::KEY)->first();

        return [
            ...OnboardingContent::get(),
            'updated_at' => $row?->updated_at?->toIso8601ZuluString(),
        ];
    }
}
