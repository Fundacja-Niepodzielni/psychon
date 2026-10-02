<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H20\ReportClosingRequest;
use App\Http\Requests\H20\ReportIndexRequest;
use App\Services\H20\ReportSummary;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H20 · GET /admin/report (+ /admin/reports, /export.csv, /closing)
 * — raport edycji. Opcjonalny zakres dat `from`/`to` (walidacja w
 * `ReportIndexRequest`). `/admin/reports` to alias `/admin/report` — sama
 * nazwa z kontraktu API (§ opis PR), trasa `show()` bez zmian, dodana
 * obok istniejącej (wstecznie kompatybilnie, nic nie usunięte).
 */
class ReportController extends Controller
{
    private const array ETYKIETY_ROLI = [
        'volunteer' => 'Wolontariusz',
        'student' => 'Student',
    ];

    private const array ETYKIETY_STANU = [
        'active' => 'aktywne',
        'blocked' => 'zablokowane',
    ];

    private const string NIE_DOTYCZY = 'nie dotyczy';

    public function show(ReportIndexRequest $request): JsonResponse
    {
        return response()->json([
            'data' => ReportSummary::build($request->query('from'), $request->query('to')),
        ]);
    }

    /**
     * Raport zamknięcia wskazanej edycji — `edition` wymagany
     * (`ReportClosingRequest`), osobne działanie od `show()`.
     */
    public function closing(ReportClosingRequest $request): JsonResponse
    {
        return response()->json([
            'data' => ReportSummary::closing((int) $request->query('edition')),
        ]);
    }

    /**
     * Eksport zestawienia imiennego — ten sam wspólny helper `Csv` co dziennik.
     * Z `uklad=zestawienie` — pełne zestawienie roku programu
     * (`zestawienie()`); bez parametru plik bez zmian.
     */
    public function export(ReportIndexRequest $request): StreamedResponse
    {
        if ($request->query('uklad') === ReportIndexRequest::UKLAD_ZESTAWIENIA) {
            return $this->zestawienie($request->query('from'), $request->query('to'));
        }

        $rows = [['id', 'first_name', 'last_name', 'role', 'hours_accepted', 'consultations', 'certificate_issued']];

        foreach (ReportSummary::people($request->query('from'), $request->query('to')) as $person) {
            $rows[] = [
                $person['id'],
                $person['first_name'],
                $person['last_name'],
                $person['role'],
                $person['hours_accepted'],
                $person['consultations'],
                $person['certificate_issued'] ? '1' : '0',
            ];
        }

        return Csv::download('raport.csv', $rows);
    }

    /**
     * Zestawienie imienne roku programu do użytku w Fundacji (nie dla
     * grantodawcy): te same wiersze co `ReportSummary::people()`, polskie
     * nagłówki, liczby dziesiętne z przecinkiem (polski arkusz czyta „41.5”
     * jako datę). Staż i superwizje studentów — „nie dotyczy”. Godziny
     * i konsultacje „w okresie” zawęża zakres dat, pozostałe kolumny to stan
     * dziś. Plik nie ma miejsca na uwagi.
     */
    private function zestawienie(?string $from, ?string $to): StreamedResponse
    {
        $rows = [[
            'Numer osoby', 'Imię', 'Nazwisko', 'Rola', 'Stan konta',
            'Kursy ukończone', 'Kursy w ścieżce',
            'Staż: godziny zaakceptowane', 'Staż: godziny wymagane',
            'Superwizje: obecności', 'Superwizje: wymagane',
            'Warsztat zaliczony', 'Godziny dyżurów w okresie', 'Konsultacje w okresie',
            'Certyfikat (bez unieważnionych)',
        ]];

        foreach (ReportSummary::people($from, $to) as $person) {
            $internship = $person['internship'];
            $supervision = $person['supervision'];

            $rows[] = [
                $person['id'],
                $person['first_name'],
                $person['last_name'],
                self::ETYKIETY_ROLI[$person['role']] ?? $person['role'],
                self::ETYKIETY_STANU[$person['status']] ?? $person['status'],
                $person['courses_done'],
                $person['courses_total'],
                $internship === null ? self::NIE_DOTYCZY : self::przecinek($internship['done']),
                $internship === null ? self::NIE_DOTYCZY : self::przecinek($internship['required']),
                $supervision === null ? self::NIE_DOTYCZY : $supervision['attended'],
                $supervision === null ? self::NIE_DOTYCZY : $supervision['required'],
                $person['workshop_completed_at'] === null
                    ? 'nie'
                    : Carbon::parse($person['workshop_completed_at'])->timezone('Europe/Warsaw')->toDateString(),
                self::przecinek($person['hours_accepted']),
                $person['consultations'],
                $person['certificate_valid'] ? 'tak' : 'nie',
            ];
        }

        return Csv::download('zestawienie-roku-programu.csv', $rows);
    }

    /** Liczba dziesiętna z kontraktu („41.5”) w zapisie polskiego arkusza („41,5”). */
    private static function przecinek(string $liczba): string
    {
        return str_replace('.', ',', $liczba);
    }
}
