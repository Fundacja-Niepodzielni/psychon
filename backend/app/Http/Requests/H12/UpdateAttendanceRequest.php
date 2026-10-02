<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use App\Services\H12\SupervisionAttendanceService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `PATCH /instructor/slots/{id}/attendance`. Rola rozstrzyga pierwsza (403,
 * `authorize()` — czysta funkcja ról tokenu), potem zasięg terminu —
 * nieznany, odwołany i cudzy dają jedno 404 (`passesAuthorization()`) — i
 * dopiero wtedy walidacja ciała, więc odpowiedź dla terminu spoza zasięgu
 * nie zależy od treści żądania.
 */
class UpdateAttendanceRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('instructor');
    }

    /**
     * Po roli, przed walidacją ciała (`validateResolved()`: autoryzacja →
     * walidator): termin spoza zasięgu prowadzącego kończy żądanie 404.
     */
    protected function passesAuthorization()
    {
        if (! parent::passesAuthorization()) {
            return false;
        }

        $this->container->make(SupervisionAttendanceService::class)
            ->scopedSlot($this->user(), (int) $this->route('id'));

        return true;
    }

    public function rules(): array
    {
        return [
            'attendance' => ['required', 'array', 'min:1'],
            'attendance.*' => ['required', 'string', 'in:present,absent'],
        ];
    }

    public function messages(): array
    {
        return [
            'attendance.required' => 'Podaj listę obecności.',
            'attendance.array' => 'Lista obecności ma nieprawidłowy format.',
            'attendance.min' => 'Zaznacz co najmniej jedną osobę.',
            'attendance.*.required' => 'Każda osoba musi mieć oznaczoną obecność.',
            'attendance.*.in' => 'Obecność może mieć wartość obecny albo nieobecny.',
        ];
    }
}
