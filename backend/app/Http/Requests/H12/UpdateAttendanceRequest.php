<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use App\Services\H12\SupervisionAttendanceService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * `PATCH /instructor/slots/{id}/attendance`. Rola rozstrzyga pierwsza (403),
 * potem zasięg terminu — nieznany, odwołany i cudzy dają jedno 404 — i
 * dopiero wtedy walidacja ciała, więc odpowiedź dla terminu spoza zasięgu
 * nie zależy od treści żądania.
 */
class UpdateAttendanceRequest extends FormRequest
{
    public function authorize(TokenRoles $roles, SupervisionAttendanceService $attendance): bool
    {
        if (! $roles->has('instructor')) {
            return false;
        }

        $attendance->scopedSlot($this->user(), (int) $this->route('id'));

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
