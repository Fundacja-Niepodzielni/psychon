<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\H10\ResetAttemptsRequest;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\H10\TestGrader;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H10 · Reset limitu podejść do testu (decyzja po recenzji: robi to
 * opiekun, z podanym powodem).
 *
 * POST /admin/tests/{test}/users/{user}/reset-attempts {reason} → 200 [audyt]
 *
 * Reset czyści dotychczasowe podejścia użytkownika do tego testu, więc
 * numeracja startuje od nowa (1). Powód i wykonawca trafiają do dziennika
 * działań (`attempts.reset`).
 */
class AdminTestResetController extends Controller
{
    public function store(ResetAttemptsRequest $request, Test $test, User $user): JsonResponse
    {
        $reason = $request->validated('reason');

        $cleared = DB::transaction(function () use ($test, $user, $request, $reason): int {
            $cleared = TestAttempt::where('user_id', $user->id)
                ->where('test_id', $test->id)
                ->delete();

            AuditLog::record($request->user(), 'attempts.reset', $user, [
                'test_id' => $test->id,
                'reason' => $reason,
                'cleared' => $cleared,
            ]);

            return $cleared;
        });

        return response()->json(['data' => [
            'test_id' => $test->id,
            'user_id' => $user->id,
            'cleared' => $cleared,
            'attempts_used' => 0,
            'attempts_limit' => TestGrader::attemptsLimit($test),
        ]]);
    }
}
