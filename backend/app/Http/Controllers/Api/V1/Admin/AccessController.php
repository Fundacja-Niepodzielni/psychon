<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H04\ExtendAccessRequest;
use App\Http\Resources\UserResource;
use App\Models\AccessDateChange;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use App\Support\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * H04 · Dostęp czasowy — przedłużenie jednym działaniem administracji.
 */
class AccessController extends Controller
{
    /**
     * POST /admin/users/{id}/extend-access — {months} albo {until}, oraz {reason}.
     *
     * `months` liczy się od bieżącej daty wygaśnięcia, jeśli jest jeszcze
     * w przyszłości (przedłużenia się sumują), albo od teraz, gdy dostęp już
     * wygasł. `until` ustawia datę wprost: najwcześniej jutro (początek dnia),
     * najdalej dziś + 24 miesiące (dni w kalendarzu polskim). Datę mają tylko
     * osoby w programie (wolontariusz, student). Konto i zasięg osoby wywołującej (konto Super
     * Admina tylko dla Super Admina, własne konto nigdy) sprawdza
     * `ExtendAccessRequest::authorize()` przed walidacją ciała; wynik w obu
     * trybach nie wychodzi poza pułap `ExtendAccessRequest::MAX_MONTHS_AHEAD`.
     *
     * Data w `users` i wiersz rekordu zmian (`access_date_changes`, z powodem)
     * powstają w jednej transakcji. Powód jest treścią wpisaną ręcznie, więc
     * żyje wyłącznie w rekordzie — ładunek `access.extended` niesie same daty.
     */
    public function extend(ExtendAccessRequest $request, int $id): JsonResponse
    {
        $actor = $request->user();
        $reason = (string) $request->validated('reason');

        $user = DB::transaction(function () use ($request, $actor, $reason, $id): User {
            $user = User::query()->whereKey($id)->lockForUpdate()->first();

            if ($user === null) {
                throw AccountManagementGuard::notFound();
            }

            $previous = $user->access_expires_at;

            if ($request->filled('until')) {
                $newExpiry = $request->date('until');
            } else {
                $base = ($previous !== null && $previous->isFuture()) ? $previous : now();
                $newExpiry = $base->copy()->addMonthsNoOverflow((int) $request->input('months'));

                $latest = ExtendAccessRequest::latestAllowedDate();

                if ($newExpiry->greaterThan($latest)) {
                    throw ValidationException::withMessages([
                        'months' => ['Dostęp można przedłużyć najdalej do '.$latest->toDateString().'.'],
                    ]);
                }
            }

            $user->forceFill(['access_expires_at' => $newExpiry])->save();

            AccessDateChange::query()->create([
                'user_id' => $user->id,
                'changed_by' => $actor?->id,
                'previous_expires_at' => $previous,
                'new_expires_at' => $newExpiry,
                'reason' => $reason,
            ]);

            AuditLog::record(
                $actor,
                'access.extended',
                $user,
                [
                    'previous_access_expires_at' => $previous?->toIso8601ZuluString(),
                    'access_expires_at' => $newExpiry->toIso8601ZuluString(),
                ],
            );

            return $user;
        });

        return response()->json(['data' => UserResource::withoutActivationConfirmation($user->fresh())->resolve()]);
    }
}
