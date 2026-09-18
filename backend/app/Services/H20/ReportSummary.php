<?php

namespace App\Services\H20;

use App\Models\Application;
use App\Models\InternshipEntry;
use App\Models\User;
use App\Services\H19\DashboardSummary;
use App\Support\ProgressAggregator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Raport edycji (H20, GET /admin/report). Kryterium ★1: te same liczby co
 * karta osoby (`ProgressAggregator`) i pulpit (`DashboardSummary` — H19).
 *
 * `active`/`completed`/`certificates_issued` wołają wprost
 * `DashboardSummary::build()` zamiast liczyć te same COUNT-y drugi raz —
 * gwarancja równości przez wspólny kod, nie przez „policzone tak samo".
 *
 * Poz. 27 „Rozszerzone raporty" — zakres dat `$from`/`to` zawęża godziny
 * i konsultacje po `internship_entries.date` (kolumna, po której raport już
 * agreguje — patrz sumy niżej). Liczniki pulpitu (`admitted`/`active`/
 * `completed`/`certificates_issued`) NIE są filtrowane — pochodzą ze stanu
 * bieżącego (`DashboardSummary`/`Application::accepted()`), nie z dziennika
 * zdarzeń z własną datą; to alternatywna interpretacja „okresu", tu
 * świadomie pominięta jako wymagająca osobnej zmiany w H19.
 */
final class ReportSummary
{
    /**
     * @return array{
     *     summary: array{
     *         admitted: int, active: int, completed: int,
     *         hours_accepted_total: string, hours_accepted_average: string,
     *         consultations_total: int, certificates_issued: int,
     *     },
     *     people: list<array{
     *         id: int, first_name: string, last_name: string, role: string,
     *         hours_accepted: string, consultations: int, certificate_issued: bool,
     *     }>,
     * }
     */
    public static function build(?string $from = null, ?string $to = null): array
    {
        $dashboard = DashboardSummary::build();

        $hoursTotal = (float) self::acceptedEntries($from, $to)->sum('hours');
        $consultationsTotal = (int) self::acceptedEntries($from, $to)->sum('consultations_count');
        $active = $dashboard['counters']['participants'];

        return [
            'summary' => [
                'admitted' => Application::accepted()->count(),
                'active' => $active,
                'completed' => $dashboard['counters']['completed'],
                'hours_accepted_total' => ProgressAggregator::formatDecimal($hoursTotal),
                'hours_accepted_average' => ProgressAggregator::formatDecimal(
                    $active > 0 ? $hoursTotal / $active : 0.0,
                ),
                'consultations_total' => $consultationsTotal,
                'certificates_issued' => $dashboard['counters']['certificates'],
            ],
            'people' => self::people($from, $to)->all(),
        ];
    }

    /**
     * Zestawienie imienne — jedno źródło dla ekranu raportu i CSV.
     *
     * @return Collection<int, array{id:int, first_name:string, last_name:string, role:string, hours_accepted:string, consultations:int, certificate_issued:bool}>
     */
    public static function people(?string $from = null, ?string $to = null): Collection
    {
        $certifiedUserIds = User::query()
            ->whereHas('certificates')
            ->pluck('id')
            ->flip();

        return User::query()
            ->whereIn('role', ['volunteer', 'student'])
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'role' => $user->role,
                'hours_accepted' => ProgressAggregator::formatDecimal(
                    (float) self::acceptedEntries($from, $to, $user->id)->sum('hours'),
                ),
                'consultations' => (int) self::acceptedEntries($from, $to, $user->id)->sum('consultations_count'),
                'certificate_issued' => $certifiedUserIds->has($user->id),
            ])
            ->values();
    }

    /**
     * Wpisy stażu ze statusem `accepted`, opcjonalnie zawężone datą wpisu
     * (`internship_entries.date`, `$from`/`to` w formacie ISO, oba brzegi
     * włącznie) i osobą.
     */
    private static function acceptedEntries(?string $from, ?string $to, ?int $userId = null): Builder
    {
        $query = InternshipEntry::where('status', 'accepted');

        if ($userId !== null) {
            $query->where('user_id', $userId);
        }

        if ($from !== null) {
            $query->whereDate('date', '>=', $from);
        }

        if ($to !== null) {
            $query->whereDate('date', '<=', $to);
        }

        return $query;
    }
}
