<?php

namespace App\Http\Controllers\Api\V1\H15;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H15\StoreProfileDocumentRequest;
use App\Http\Requests\H15\SubmitPsychologistProfileRequest;
use App\Http\Requests\H15\UpdatePsychologistProfileRequest;
use App\Http\Resources\H15\ProfileDocumentResource;
use App\Http\Resources\H15\PsychologistProfileResource;
use App\Models\Consent;
use App\Models\PsychologistProfile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PsychologistProfileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->psychologistProfile ?? new PsychologistProfile([
            'user_id' => $user->id,
            'status' => 'draft',
        ]);

        return response()->json([
            'data' => PsychologistProfileResource::make($profile, $user)->resolve($request),
        ]);
    }

    public function update(UpdatePsychologistProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->assertEligible($user);

        $profile = DB::transaction(function () use ($request, $user): PsychologistProfile {
            $profile = PsychologistProfile::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();

            $this->assertEditable($profile);

            $profile ??= new PsychologistProfile(['user_id' => $user->id, 'status' => 'draft']);
            $profile->fill($request->validated());
            $profile->save();

            return $profile;
        });

        return response()->json([
            'data' => PsychologistProfileResource::make($profile, $user)->resolve($request),
        ]);
    }

    public function submit(SubmitPsychologistProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->assertEligible($user);

        $profile = DB::transaction(function () use ($request, $user): PsychologistProfile {
            $profile = PsychologistProfile::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();

            $this->assertEditable($profile);

            $profile ??= PsychologistProfile::create(['user_id' => $user->id, 'status' => 'draft']);

            $missing = [];
            if (blank($profile->specializations)) {
                $missing[] = 'specializations';
            }
            if (blank($profile->approach)) {
                $missing[] = 'approach';
            }
            if (blank($profile->city)) {
                $missing[] = 'city';
            }
            if (! $profile->documents()->where('type', 'dyplom')->exists()) {
                $missing[] = 'documents';
            }
            if ($request->boolean('publication_consent') !== true) {
                $missing[] = 'consent';
            }

            if ($missing !== []) {
                throw new ApiException(422, 'profile_incomplete', 'Uzupełnij wniosek przed złożeniem.', reason: [
                    'missing' => $missing,
                ]);
            }

            Consent::create([
                'user_id' => $user->id,
                'type' => 'publikacja_profilu',
                'granted_at' => now(),
            ]);

            $profile->forceFill(['status' => 'submitted'])->save();

            return $profile->fresh();
        });

        return response()->json([
            'data' => PsychologistProfileResource::make($profile, $user)->resolve($request),
        ]);
    }

    public function storeDocument(StoreProfileDocumentRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->assertEligible($user);

        $document = DB::transaction(function () use ($request, $user) {
            $profile = PsychologistProfile::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();

            $this->assertEditable($profile);

            $profile ??= PsychologistProfile::create(['user_id' => $user->id, 'status' => 'draft']);

            $path = $request->file('file')->store("profile-documents/{$profile->id}", 'local');

            return $profile->documents()->create([
                'type' => $request->string('type')->value(),
                'file_path' => $path,
                'uploaded_at' => now(),
            ]);
        });

        return response()->json([
            'data' => ProfileDocumentResource::make($document)->resolve($request),
        ], 201);
    }

    public function withdrawConsent(Request $request): JsonResponse
    {
        $user = $request->user();

        $profile = DB::transaction(function () use ($user): PsychologistProfile {
            $profile = PsychologistProfile::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();

            $consent = $user->consents()
                ->where('type', 'publikacja_profilu')
                ->whereNotNull('granted_at')
                ->whereNull('withdrawn_at')
                ->latest('granted_at')
                ->first();

            if ($profile === null || $consent === null) {
                throw new ApiException(422, 'validation_failed', 'Brak udzielonej zgody na publikację do wycofania.');
            }

            $consent->forceFill(['withdrawn_at' => now()])->save();
            $profile->forceFill(['status' => 'withdrawn'])->save();

            // profile.withdrawn nie jest jeszcze w rejestrze §3.1/§3.2 (zgłoszenie
            // do strażnika w toku, design.md → Open Questions) — do czasu
            // przyznania slugu zespół widzi wycofane wnioski wyłącznie przez
            // GET /admin/profiles?status=withdrawn, bez AuditLog/Notify.

            return $profile->fresh();
        });

        return response()->json([
            'data' => PsychologistProfileResource::make($profile, $user)->resolve($request),
        ]);
    }

    private function assertEligible(User $user): void
    {
        if ($user->program_completed_at === null) {
            throw new ApiException(403, 'profile_not_eligible', 'Ukończ program, aby złożyć wniosek o wpis do bazy psychologów.');
        }
    }

    private function assertEditable(?PsychologistProfile $profile): void
    {
        if ($profile !== null && ! in_array($profile->status, ['draft', 'returned'], true)) {
            throw new ApiException(403, 'entry_locked', 'Wniosek nie jest w stanie umożliwiającym edycję.');
        }
    }
}
