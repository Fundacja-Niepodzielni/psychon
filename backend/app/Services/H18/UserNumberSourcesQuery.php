<?php

namespace App\Services\H18;

use App\Models\Course;
use App\Models\InternshipEntry;
use App\Models\LessonProgress;
use App\Models\SupervisionSignup;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use App\Services\Lessons\LessonCompletionRule;
use App\Support\CourseAccess;
use App\Support\ProgressAggregator;

/**
 * Pakiet H18 · jedno źródło wierszy stojących za pięcioma liczbami, które
 * dziś pokazuje karta osoby (`AdminUserCardResource`) i punkt rzetelności
 * (`ReliabilityController::adminShow`).
 *
 * Kształt wiersza jest jeden dla wszystkich pięciu sekcji: `date`, `occurred_at`
 * (dokładnie jedno z dwóch niepuste — staż niesie `date`, reszta `occurred_at`),
 * `value`, `state`, `form` (tylko `hours_accepted`, inaczej `null`) i `label`.
 *
 * Każda sekcja liczy `sum` DOKŁADNIE tym samym filtrem/wzorem co pole, które
 * dziś pokazuje karta osoby — żadna liczba nie ma tu drugiej definicji:
 *   - hours_accepted      → ten sam filtr co `ProgressAggregator::for()['hours_accepted']`
 *   - supervision_present → ten sam filtr co `ProgressAggregator::for()['supervision_present']`
 *   - workshop            → to samo `exists()` co `ProgressAggregator::for()['workshop_done']`
 *   - passed_tests        → ten sam zbiór (ścieżka kursów z testem, `CourseAccess::testPassed`)
 *                            co `ProgressAggregator::for()['path_tests_passed']` — NIE
 *                            `ProgressAggregator::passedTestsCount()`, który liczy inną
 *                            wielkość (różne zaliczone testy na całej platformie, bez
 *                            mianownika ścieżki) i nie stoi na karcie osoby
 *   - reliability         → `sum` to WYNIK `ProgressAggregator::reliabilityPercent()` wprost
 *                            (stosunek, nie suma kolumny `value` — wiersze są jego składowymi,
 *                            nie sumowalną listą; patrz komentarz przy `reliability()`)
 */
final class UserNumberSourcesQuery
{
    /** @return array<string, array<string, mixed>> */
    public static function for(User $user): array
    {
        return [
            'hours_accepted' => self::hoursAccepted($user),
            'supervision_present' => self::supervisionPresent($user),
            'workshop' => self::workshop($user),
            'passed_tests' => self::passedTests($user),
            'reliability' => self::reliability($user),
        ];
    }

    /** @return array{rows: list<array<string, mixed>>, sum: string} */
    private static function hoursAccepted(User $user): array
    {
        $entries = $user->internshipEntries()
            ->where('status', 'accepted')
            ->orderBy('date')
            ->orderBy('id')
            ->get();

        $rows = $entries
            ->map(fn (InternshipEntry $entry): array => [
                'date' => $entry->date?->toDateString(),
                'occurred_at' => null,
                'value' => (string) $entry->hours,
                'state' => $entry->status,
                'form' => $entry->form,
                'label' => null,
            ])
            ->values()
            ->all();

        // Ta sama suma co `ProgressAggregator::for()`: identyczny filtr, osobne
        // zapytanie SUM zamiast sumowania kolekcji — bez ryzyka rozjazdu zaokrągleń.
        $sum = (float) $user->internshipEntries()->where('status', 'accepted')->sum('hours');

        return ['rows' => $rows, 'sum' => ProgressAggregator::formatDecimal($sum)];
    }

    /** @return array{rows: list<array<string, mixed>>, sum: int} */
    private static function supervisionPresent(User $user): array
    {
        $signups = $user->supervisionSignups()
            ->where('attendance', 'present')
            ->whereNull('cancelled_at')
            ->with('slot.supervisor')
            ->orderBy('id')
            ->get();

        $rows = $signups
            ->map(fn (SupervisionSignup $signup): array => [
                'date' => null,
                'occurred_at' => $signup->slot?->starts_at?->toIso8601ZuluString(),
                'value' => 1,
                'state' => 'present',
                'form' => null,
                'label' => self::personName($signup->slot?->supervisor),
            ])
            ->values()
            ->all();

        return ['rows' => $rows, 'sum' => $signups->count()];
    }

    /**
     * `done` to DOKŁADNIE pole karty (`workshop_done`, `WorkshopCompletion::exists()`).
     * `sum` to liczba wierszy (dziś zawsze 0 albo 1 — `AdminWorkshopController::store()`
     * robi `firstOrCreate` per edycja) — nie duplikuje `done`, tylko go tłumaczy na wiersze.
     *
     * @return array{rows: list<array<string, mixed>>, sum: int, done: bool}
     */
    private static function workshop(User $user): array
    {
        $completions = $user->workshopCompletions()
            ->with('markedBy')
            ->orderBy('completed_at')
            ->orderBy('id')
            ->get();

        $rows = $completions
            ->map(fn (WorkshopCompletion $completion): array => [
                'date' => null,
                'occurred_at' => $completion->completed_at->toIso8601ZuluString(),
                'value' => 1,
                'state' => 'completed',
                'form' => null,
                'label' => self::personName($completion->markedBy),
            ])
            ->values()
            ->all();

        return [
            'rows' => $rows,
            'sum' => $completions->count(),
            'done' => $completions->isNotEmpty(),
        ];
    }

    /**
     * Jeden wiersz na KAŻDY kurs ścieżki z testem, dla którego
     * `CourseAccess::testPassed()` jest prawdziwe — DOKŁADNIE ten sam zbiór,
     * który `ProgressAggregator::for()` liczy do `path_tests_passed` (kursy
     * ścieżki — `sequence_order` niepuste, `type = course`, `is_published`,
     * przefiltrowane do tych z testem). Rekord źródłowy wiersza to
     * NAJWCZEŚNIEJSZA zaliczająca próba tego testu.
     *
     * @return array{rows: list<array<string, mixed>>, sum: int}
     */
    private static function passedTests(User $user): array
    {
        $pathCourses = Course::query()
            ->whereNotNull('sequence_order')
            ->where('type', 'course')
            ->where('is_published', true)
            ->orderBy('sequence_order')
            ->with('test')
            ->get();

        $passedCourses = $pathCourses
            ->filter(fn (Course $course): bool => $course->test !== null && CourseAccess::testPassed($user, $course))
            ->values();

        $rows = $passedCourses
            ->map(function (Course $course) use ($user): array {
                $attempt = TestAttempt::query()
                    ->where('user_id', $user->id)
                    ->where('test_id', $course->test->id)
                    ->where('passed', true)
                    ->orderBy('created_at')
                    ->orderBy('id')
                    ->first();

                return [
                    'date' => null,
                    'occurred_at' => $attempt?->created_at?->toIso8601ZuluString(),
                    'value' => 1,
                    'state' => 'passed',
                    'form' => null,
                    'label' => $course->title,
                ];
            })
            ->values()
            ->all();

        return ['rows' => $rows, 'sum' => $passedCourses->count()];
    }

    /**
     * `sum` to WYNIK `ProgressAggregator::reliabilityPercent()` — stosunek
     * aktywnego czasu do długości lekcji w procentach (napis albo `null`,
     * ten sam format co `reliability_percent` na `GET /admin/reliability/{userId}`),
     * nie suma kolumny `value`. Wiersze (lekcje) są SKŁADOWYMI tego stosunku
     * (`active_seconds` dzielone przez `duration_seconds` per lekcja,
     * zsumowane, potem procent) — naciąganie `sum` do sumy kolumny `value`
     * dałoby liczbę sekund, nie procent, i rozjechałoby się z kartą. Ten sam
     * filtr lekcji (z nagraniem, dodatni czas trwania) co
     * `ProgressAggregator::reliabilityPercent()`.
     *
     * @return array{rows: list<array<string, mixed>>, sum: string|null}
     */
    private static function reliability(User $user): array
    {
        $lessons = $user->lessonProgress()
            ->where('is_completed', true)
            ->whereHas('lesson', fn ($query) => $query->where('duration_seconds', '>', 0))
            ->with('lesson:'.implode(',', ['id', 'title', ...ProgressAggregator::MEASURABLE_LESSON_COLUMNS]))
            ->orderBy('last_activity_at')
            ->get()
            ->filter(fn (LessonProgress $progress): bool => LessonCompletionRule::isMeasurable($progress->lesson));

        $rows = $lessons
            ->map(fn (LessonProgress $progress): array => [
                'date' => null,
                'occurred_at' => $progress->last_activity_at?->toIso8601ZuluString(),
                'value' => (int) $progress->active_seconds,
                'state' => 'completed',
                'form' => null,
                'label' => $progress->lesson->title,
            ])
            ->values()
            ->all();

        $percent = ProgressAggregator::reliabilityPercent($user);

        return ['rows' => $rows, 'sum' => $percent === null ? null : (string) $percent];
    }

    private static function personName(?User $person): ?string
    {
        if ($person === null) {
            return null;
        }

        $name = trim($person->first_name.' '.$person->last_name);

        return $name === '' ? null : $name;
    }
}
