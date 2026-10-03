<?php

namespace App\Http\Requests\H04;

use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;

/**
 * POST /admin/users/{id}/extend-access — dokładnie jedno z dwóch pól.
 *
 * Konto i zasięg osoby wywołującej (konto Super Admina tylko dla Super Admina) są
 * sprawdzane w `authorize()`, przed walidacją ciała. Data końca dostępu jest
 * zawsze przyszła i nie dalsza niż `MAX_MONTHS_AHEAD` miesięcy od dziś.
 */
class ExtendAccessRequest extends FormRequest
{
    /** Górny pułap daty końca dostępu, liczony od dzisiejszego dnia. */
    public const MAX_MONTHS_AHEAD = 24;

    public static function latestAllowedDate(): Carbon
    {
        return now()->addMonthsNoOverflow(self::MAX_MONTHS_AHEAD)->endOfDay();
    }

    public function authorize(): bool
    {
        // Rola sekcji: middleware `role:project_manager,super_admin` na trasie.
        $guard = app(AccountManagementGuard::class);
        $guard->assertMayManage($guard->target($this->route('id')));

        return true;
    }

    public function rules(): array
    {
        return [
            'months' => ['required_without:until', 'prohibits:until', 'nullable', 'integer', 'min:1', 'max:'.self::MAX_MONTHS_AHEAD],
            'until' => [
                'required_without:months', 'prohibits:months', 'nullable', 'date',
                'after:today', 'before_or_equal:'.self::latestAllowedDate()->toDateTimeString(),
            ],
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
            'until.after' => 'Data końca dostępu musi być późniejsza niż dzisiejsza.',
            'until.before_or_equal' => 'Dostęp można przedłużyć najdalej do '.self::latestAllowedDate()->toDateString().'.',
        ];
    }
}
