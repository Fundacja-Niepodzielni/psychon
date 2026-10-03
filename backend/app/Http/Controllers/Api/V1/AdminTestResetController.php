<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\H10\ResetAttemptsRequest;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\TestAttemptReset;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\H10\PassedTestGuard;
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
 * podejścia liczą się od początku. Powód i osoba zerująca trafiają do rekordu
 * wyzerowania (`test_attempt_resets`), a dziennik działań (`attempts.reset`)
 * niesie test i liczbę skasowanych podejść.
 *
 * Zaliczony test → 403 `test_already_passed`, nic nie skasowane, bez audytu.
 * Odmowa stoi po dostępie (rola, 404) i po walidacji powodu (422).
 */
class AdminTestResetController extends Controller
{
    public function store(ResetAttemptsRequest $request, Test $test, User $user): JsonResponse
    {
        $reason = $request->validated('reason');

        $cleared = DB::transaction(function () use ($test, $user, $request, $reason): int {
            // Ta sama blokada wiersza osoby co przy zapisie podejścia: podejście
            // zaliczające wysłane w tej samej chwili nie minie sprawdzenia niżej.
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            // Reset kasował wszystkie podejścia, także zaliczone, więc otwierał
            // zaliczony test i cofał zaliczenie (ścieżka, certyfikat, liczniki).
            // Zaliczony test jest zamknięty: nic nie kasujemy, bez audytu.
            $test->loadMissing('course');
            PassedTestGuard::assertNotPassed($user, $test);

            $cleared = TestAttempt::where('user_id', $user->id)
                ->where('test_id', $test->id)
                ->delete();

            // Powód wpisany przez administrację żyje w rekordzie wyzerowania
            // (zerowany przy anonimizacji osoby); rejestr niesie test i liczbę.
            TestAttemptReset::create([
                'test_id' => $test->id,
                'user_id' => $user->id,
                'reset_by' => $request->user()->id,
                'reason' => $reason,
                'cleared' => $cleared,
            ]);

            AuditLog::record($request->user(), 'attempts.reset', $user, [
                'test_id' => $test->id,
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
