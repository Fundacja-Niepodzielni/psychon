<?php

namespace App\Http\Controllers\Api\V1\H15;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H15\ReturnProfileRequest;
use App\Http\Resources\H15\AdminPsychologistProfileResource;
use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
use App\Models\SensitiveAccessLogEntry;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminProfileController extends Controller
{
    private const array VALID_STATUSES = ['draft', 'submitted', 'returned', 'accepted', 'published', 'withdrawn'];

    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status');
        $status = in_array($status, self::VALID_STATUSES, true) ? $status : 'submitted';

        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = PsychologistProfile::query()
            ->with(['user.consents', 'documents'])
            ->where('status', $status)
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (PsychologistProfile $profile): array => AdminPsychologistProfileResource::make($profile)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $profile = PsychologistProfile::query()
            ->with(['user.consents', 'documents'])
            ->find($id);

        if ($profile === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wniosku.');
        }

        return response()->json([
            'data' => AdminPsychologistProfileResource::make($profile)->resolve($request),
        ]);
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $profile = DB::transaction(function () use ($request, $id): PsychologistProfile {
            $profile = PsychologistProfile::query()
                ->with('user')
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            $this->assertSubmitted($profile);

            $profile->forceFill([
                'status' => 'accepted',
                'decided_by' => $request->user()->id,
                'decided_at' => now(),
            ])->save();

            AuditLog::record($request->user(), 'profile.accepted', $profile, ['profile_id' => $profile->id]);
            Notify::send(
                $profile->user,
                'profile.accepted',
                'Wniosek zaakceptowany',
                'Twój wniosek o wpis do bazy psychologów Fundacji został zaakceptowany.',
                '/panel/profil-psychologa',
            );

            return $profile->fresh(['user.consents', 'documents']);
        });

        return response()->json([
            'data' => AdminPsychologistProfileResource::make($profile)->resolve($request),
        ]);
    }

    public function return(ReturnProfileRequest $request, int $id): JsonResponse
    {
        $profile = DB::transaction(function () use ($request, $id): PsychologistProfile {
            $profile = PsychologistProfile::query()
                ->with('user')
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            $this->assertSubmitted($profile);

            $profile->forceFill([
                'status' => 'returned',
                'return_reason' => $request->validated('reason'),
                'decided_by' => $request->user()->id,
                'decided_at' => now(),
            ])->save();

            AuditLog::record($request->user(), 'profile.returned', $profile, ['profile_id' => $profile->id]);
            Notify::send(
                $profile->user,
                'profile.returned',
                'Wniosek wymaga poprawy',
                'Twój wniosek o wpis do bazy psychologów Fundacji został odesłany do poprawy.',
                '/panel/profil-psychologa',
            );

            return $profile->fresh(['user.consents', 'documents']);
        });

        return response()->json([
            'data' => AdminPsychologistProfileResource::make($profile)->resolve($request),
        ]);
    }

    public function downloadDocument(Request $request, int $profileId, int $docId): StreamedResponse
    {
        $document = ProfileDocument::query()
            ->where('profile_id', $profileId)
            ->whereKey($docId)
            ->first();

        if ($document === null || ! Storage::disk('local')->exists($document->file_path)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono załącznika.');
        }

        SensitiveAccessLogEntry::create([
            'viewer_id' => $request->user()->id,
            'file_type' => 'profile_document',
            'file_id' => $document->id,
            'viewed_at' => now(),
        ]);
        AuditLog::record($request->user(), 'sensitive.viewed', $document, [
            'file_type' => 'profile_document',
            'file_id' => $document->id,
        ]);

        $extension = pathinfo($document->file_path, PATHINFO_EXTENSION) ?: 'bin';
        $filename = "{$document->type}-{$document->id}.{$extension}";

        return Storage::disk('local')->download($document->file_path, $filename);
    }

    private function assertSubmitted(?PsychologistProfile $profile): void
    {
        if ($profile === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wniosku.');
        }

        if ($profile->status !== 'submitted') {
            throw new ApiException(403, 'entry_locked', 'Ten wniosek został już rozstrzygnięty.');
        }
    }
}
