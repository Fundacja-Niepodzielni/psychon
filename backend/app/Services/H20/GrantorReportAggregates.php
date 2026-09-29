<?php

namespace App\Services\H20;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\SupervisionSignup;
use App\Models\TestAttempt;
use App\Models\User;
use App\Support\CourseAccess;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

/**
 * Liczby zbiorcze raportu w ukladzie grantodawcy (H20,
 * `GET /admin/report/grantor`). Wylacznie agregaty (COUNT/SUM) - zero imion,
 * nazwisk, e-maili, PESEL-i czy innych pol wskazujacych pojedyncza osobe;
 * ksztalt odpowiedzi tego pilnuje test.
 *
 * Kazda liczba, ktora ma odpowiednik gdzie indziej w kontrakcie, pochodzi z
 * DOKLADNIE tego samego zapytania - bez drugiej definicji tej samej wielkosci:
 *
 *  - `completed`                    -> ten sam warunek co pulpit
 *                                       (`DashboardSummary::build()['counters']['completed']`,
 *                                       `users.program_completed_at` niepuste),
 *                                       tu dodatkowo zawezony okresem po tej samej kolumnie.
 *  - `certificates_issued_total`    -> ten sam warunek co pulpit
 *                                       (`DashboardSummary::build()['counters']['certificates']`,
 *                                       `Certificate::count()`), zawezony okresem po `issued_at`.
 *  - `tests_passed_total`           -> suma pola karty osoby
 *                                       `ProgressAggregator::for()['path_tests_passed']`
 *                                       (te same kursy sciezki z testem, to samo
 *                                       `CourseAccess::testPassed()`) po wszystkich osobach
 *                                       z roli `volunteer`/`student`, zawezona okresem po dacie
 *                                       najwczesniejszej zaliczajacej proby kazdego kursu - ten
 *                                       sam znacznik czasu, ktory jako `occurred_at` pokazuje
 *                                       `UserNumberSourcesQuery::passedTests()` (H18).
 *  - `supervisions_confirmed_total` -> ten sam warunek co pole karty osoby
 *                                       `ProgressAggregator::for()['supervision_present']`
 *                                       (`attendance = present`, `cancelled_at` puste), sumowany
 *                                       po wszystkich osobach i zawezony okresem po
 *                                       `supervision_slots.starts_at`.
 *
 * `accepted` BEZ okresu (`from`/`to` puste) liczy DOKLADNIE to samo zapytanie co
 * `ReportSummary::build()['summary']['admitted']` (`Application::accepted()->count()`) -
 * ten sam odpowiednik, ktory ma tu `completed` i `certificates_issued_total` wyzej. Z
 * podanym okresem zapytanie jest zawezone po `applications.decided_at` i wtedy nie ma juz
 * odpowiednika w zadnym z tych dwoch miejsc (ani pulpit, ani karta osoby nie licza przyjec
 * w zakresie dat).
 *
 * `in_program` i `removed` nie maja odpowiednika w tych dwoch miejscach niezaleznie od
 * okresu (zmierzone: `git grep in_program`/`git grep anonymized_at` w `backend/app` poza
 * tym plikiem nie pokazuje zadnego licznika ani pulpitu, ani karty osoby, ktory liczylby
 * te same wielkosci) - wlasne zapytania, kazde zawezone okresem po naturalnej dacie
 * zdarzenia danego koszyka (stan biezacy bez wlasnej daty dla `in_program`,
 * `users.anonymized_at` dla `removed`).
 *
 * `in_program` liczy WYLACZNIE aktywne konta ról `volunteer`/`student` bez daty ukonczenia -
 * konto personelu (`instructor`/`project_manager`/`super_admin`) nigdy nie wchodzi do tego
 * koszyka niezaleznie od statusu, bo filtr roli jest pierwszym warunkiem zapytania.
 */
final class GrantorReportAggregates
{
    /**
     * @return array{
     *     participants_by_status: array{
     *         accepted: int, in_program: int, completed: int, removed: int,
     *     },
     *     tests_passed_total: int,
     *     certificates_issued_total: int,
     *     supervisions_confirmed_total: int,
     * }
     */
    public static function build(?string $from = null, ?string $to = null): array
    {
        $acceptedQuery = Application::accepted();
        self::applyDateRange($acceptedQuery, 'decided_at', $from, $to);

        $inProgram = User::whereIn('role', ['volunteer', 'student'])
            ->where('status', 'active')
            ->whereNull('program_completed_at')
            ->count();

        $completedQuery = User::whereNotNull('program_completed_at');
        self::applyDateRange($completedQuery, 'program_completed_at', $from, $to);

        $removedQuery = User::whereNotNull('anonymized_at');
        self::applyDateRange($removedQuery, 'anonymized_at', $from, $to);

        $certificatesQuery = Certificate::query();
        self::applyDateRange($certificatesQuery, 'issued_at', $from, $to);

        $supervisionsQuery = SupervisionSignup::where('attendance', 'present')
            ->whereNull('cancelled_at')
            ->whereHas('slot', function (Builder $slotQuery) use ($from, $to): void {
                self::applyDateRange($slotQuery, 'starts_at', $from, $to);
            });

        return [
            'participants_by_status' => [
                'accepted' => $acceptedQuery->count(),
                'in_program' => $inProgram,
                'completed' => $completedQuery->count(),
                'removed' => $removedQuery->count(),
            ],
            'tests_passed_total' => self::testsPassedTotal($from, $to),
            'certificates_issued_total' => $certificatesQuery->count(),
            'supervisions_confirmed_total' => $supervisionsQuery->count(),
        ];
    }

    /**
     * Suma `path_tests_passed` (patrz docblock klasy) po wszystkich osobach z
     * roli `volunteer`/`student` - ta sama populacja, ktorej bez dodatkowego
     * filtra statusu uzywa `ReportSummary::people()` (ten sam pakiet H20).
     */
    private static function testsPassedTotal(?string $from, ?string $to): int
    {
        $pathCourses = Course::query()
            ->whereNotNull('sequence_order')
            ->where('type', 'course')
            ->where('is_published', true)
            ->with('test')
            ->get()
            ->filter(fn (Course $course): bool => $course->test !== null)
            ->values();

        if ($pathCourses->isEmpty()) {
            return 0;
        }

        $fromDate = $from !== null ? Carbon::parse($from)->startOfDay() : null;
        $toDate = $to !== null ? Carbon::parse($to)->endOfDay() : null;

        $total = 0;

        User::query()
            ->whereIn('role', ['volunteer', 'student'])
            ->orderBy('id')
            ->chunkById(100, function ($users) use ($pathCourses, $fromDate, $toDate, &$total): void {
                foreach ($users as $user) {
                    foreach ($pathCourses as $course) {
                        if (! CourseAccess::testPassed($user, $course)) {
                            continue;
                        }

                        $earliestPass = TestAttempt::query()
                            ->where('user_id', $user->id)
                            ->where('test_id', $course->test->id)
                            ->where('passed', true)
                            ->orderBy('created_at')
                            ->orderBy('id')
                            ->first();

                        $occurredAt = $earliestPass?->created_at;

                        if ($fromDate !== null && ($occurredAt === null || $occurredAt->lt($fromDate))) {
                            continue;
                        }

                        if ($toDate !== null && ($occurredAt === null || $occurredAt->gt($toDate))) {
                            continue;
                        }

                        $total++;
                    }
                }
            });

        return $total;
    }

    /**
     * @param  Builder<*>  $query
     */
    private static function applyDateRange(Builder $query, string $column, ?string $from, ?string $to): void
    {
        if ($from !== null) {
            $query->whereDate($column, '>=', $from);
        }

        if ($to !== null) {
            $query->whereDate($column, '<=', $to);
        }
    }
}
