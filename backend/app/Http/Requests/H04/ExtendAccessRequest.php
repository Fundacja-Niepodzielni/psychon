<?php

namespace App\Http\Requests\H04;

use App\Services\H18\AccountManagementGuard;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * POST /admin/users/{id}/extend-access — dokładnie jedno z dwóch pól
 * (`months` albo `until`) oraz wymagany `reason`. Powód trafia do rekordu
 * zmian daty dostępu, nie do dziennika zdarzeń `access.extended`.
 *
 * Konto i zasięg osoby wywołującej (konto Super Admina tylko dla Super Admina,
 * własne konto nigdy — jak przy blokadzie) są sprawdzane w `authorize()`, przed
 * walidacją ciała. Data końca dostępu dotyczy wyłącznie osób w programie
 * (wolontariusz, student); konto prowadzącego i konta administracji nie mają
 * terminu. Data jest późniejsza niż dzisiejszy dzień (najwcześniej początek
 * jutra) i nie dalsza niż `MAX_MONTHS_AHEAD` miesięcy od dziś. Dni liczą się
 * w kalendarzu polskim (`PERIOD_TIMEZONE`), nie w strefie aplikacji: „dziś” to
 * bieżący dzień w Warszawie, a górna granica obejmuje ten dzień do końca.
 * Podana data (z godziną i strefą, jeśli je ma) jest przeliczana na dzień
 * warszawski — ten sam moment, który trafia do bazy.
 */
class ExtendAccessRequest extends FormRequest
{
    /** Górny pułap daty końca dostępu, liczony od dzisiejszego dnia. */
    public const MAX_MONTHS_AHEAD = 24;

    /** Kalendarz, w którym liczą się dzień dzisiejszy, jutrzejszy i granica górna. */
    public const PERIOD_TIMEZONE = 'Europe/Warsaw';

    public const MESSAGE_NOT_AFTER_TODAY = 'Data końca dostępu musi być późniejsza niż dzisiejsza.';

    public const MESSAGE_TOO_FAR = 'Nowa data dostępu może być najwyżej '.self::MAX_MONTHS_AHEAD.' miesiące od dziś.';

    /** Koniec ostatniego dozwolonego dnia (dziś w Warszawie + 24 miesiące kalendarzowe). */
    public static function latestAllowedDate(): Carbon
    {
        return now(self::PERIOD_TIMEZONE)->addMonthsNoOverflow(self::MAX_MONTHS_AHEAD)->endOfDay();
    }

    /** Początek jutrzejszego dnia w Warszawie: najwcześniejsza dozwolona data końca dostępu. */
    public static function earliestAllowedDate(): Carbon
    {
        return now(self::PERIOD_TIMEZONE)->addDay()->startOfDay();
    }

    public function authorize(): bool
    {
        // Rola sekcji: middleware `role:project_manager,super_admin` na trasie.
        $guard = app(AccountManagementGuard::class);
        $target = $guard->target($this->route('id'));

        // Te same dwie zasady co przy blokadzie konta (BlockUserRequest).
        $guard->assertMayManage($target);
        AccountManagementGuard::assertNotOwnAccount($target, $this->user(), AccountManagementGuard::cannotExtendOwnAccess());
        AccountManagementGuard::assertAccessDateApplies($target);

        return true;
    }

    protected function prepareForValidation(): void
    {
        $reason = $this->input('reason');

        if (is_string($reason)) {
            // Same białe znaki to brak powodu.
            $this->merge(['reason' => trim($reason)]);
        }
    }

    public function rules(): array
    {
        return [
            'months' => ['required_without:until', 'prohibits:until', 'nullable', 'integer', 'min:1', 'max:'.self::MAX_MONTHS_AHEAD],
            'until' => [
                'required_without:months', 'prohibits:months', 'nullable', 'date',
                static function (string $attribute, mixed $value, Closure $fail): void {
                    try {
                        $day = Carbon::parse((string) $value)->setTimezone(self::PERIOD_TIMEZONE)->startOfDay();
                    } catch (Throwable) {
                        return;
                    }

                    if ($day->lessThan(self::earliestAllowedDate())) {
                        $fail(self::MESSAGE_NOT_AFTER_TODAY);
                    } elseif ($day->greaterThan(self::latestAllowedDate())) {
                        $fail(self::MESSAGE_TOO_FAR);
                    }
                },
            ],
            'reason' => ['required', 'string', 'min:1', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'months.required_without' => 'Podaj liczbę miesięcy albo konkretną datę.',
            'until.required_without' => 'Podaj liczbę miesięcy albo konkretną datę.',
            'months.prohibits' => 'Podaj tylko jedno: liczbę miesięcy albo datę.',
            'until.prohibits' => 'Podaj tylko jedno: liczbę miesięcy albo datę.',
            'months.max' => 'Dostęp można przedłużyć najwyżej o :max miesiące.',
            'reason.required' => 'Podaj powód zmiany daty dostępu.',
            'reason.string' => 'Powód musi być tekstem.',
            'reason.max' => 'Powód jest za długi (maksymalnie :max znaków).',
        ];
    }
}
