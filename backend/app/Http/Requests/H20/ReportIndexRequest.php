<?php

namespace App\Http\Requests\H20;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /admin/report (+ export.csv) — opcjonalny zakres dat, „zestawienie za
 * wskazany okres". Filtr działa na `internship_entries.date`
 * (kolumna, po której raport już agreguje godziny i konsultacje — patrz
 * `ReportSummary`); liczniki pulpitu (`admitted`/`active`/`completed`/
 * `certificates_issued`) pozostają bez zmian, bo pochodzą z osobnego
 * `DashboardSummary` (H19) i nie mają własnej daty zdarzenia w tym raporcie.
 * Nazewnictwo `from`/`to` zgodne z `AuditIndexRequest` (ten sam pakiet H20).
 *
 * `uklad` dotyczy wyłącznie `export.csv`: `zestawienie` daje pełne
 * zestawienie imienne roku programu (polskie nagłówki, staż i superwizje
 * „ile z ilu”, warsztat). Bez parametru plik jest taki jak dotąd.
 */
class ReportIndexRequest extends FormRequest
{
    public const string UKLAD_ZESTAWIENIA = 'zestawienie';

    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date', 'after_or_equal:from'],
            'uklad' => ['sometimes', 'nullable', 'in:'.self::UKLAD_ZESTAWIENIA],
        ];
    }

    public function messages(): array
    {
        return [
            'from.date' => 'Podaj poprawną datę początkową.',
            'to.date' => 'Podaj poprawną datę końcową.',
            'to.after_or_equal' => 'Data końca nie może być wcześniejsza niż data początku.',
            'uklad.in' => 'Nieznany układ pliku.',
        ];
    }
}
