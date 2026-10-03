<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H04\ExtendAccessRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * H04 · Dostęp czasowy — przedłużenie jednym działaniem administracji.
 */
class AccessController extends Controller
{
    /**
     * POST /admin/users/{id}/extend-access — {months} albo {until}.
     *
     * `months` liczy się od bieżącej daty wygaśnięcia, jeśli jest jeszcze
     * w przyszłości (przedłużenia się sumują), albo od teraz, gdy dostęp już
     * wygasł. `until` ustawia datę wprost. Konto i zasięg osoby wywołującej sprawdza
     * `ExtendAccessRequest::authorize()` przed walidacją ciała; wynik w obu
     * trybach nie wychodzi poza pułap `ExtendAccessRequest::MAX_MONTHS_AHEAD`.
     */
    public function extend(ExtendAccessRequest $request, int $id): JsonResponse
    {
        $user = User::find($id);

        if ($user === null) {
            throw AccountManagementGuard::notFound();
        }

        $previous = $user->access_expires_at;

        if ($request->filled('until')) {
            $newExpiry = $request->date('until');
        } else {
            $base = ($previous !== null && $previous->isFuture()) ? $previous : now();
            $newExpiry = $base->copy()->addMonths((int) $request->input('months'));

            $latest = ExtendAccessRequest::latestAllowedDate();

            if ($newExpiry->greaterThan($latest)) {
                throw ValidationException::withMessages([
                    'months' => ['Dostęp można przedłużyć najdalej do '.$latest->toDateString().'.'],
                ]);
            }
        }

        $user->forceFill(['access_expires_at' => $newExpiry])->save();

        AuditLog::record(
            $request->user(),
            'access.extended',
            $user,
            [
                'previous_access_expires_at' => $previous?->toIso8601ZuluString(),
                'access_expires_at' => $newExpiry->toIso8601ZuluString(),
            ],
        );

        return response()->json(['data' => UserResource::withoutActivationConfirmation($user->fresh())->resolve()]);
    }
}
