<?php

namespace App\Http\Requests\H12;

use App\Services\Auth\TokenRoles;
use Illuminate\Foundation\Http\FormRequest;

class UpdateAttendanceRequest extends FormRequest
{
    public function authorize(TokenRoles $roles): bool
    {
        return $roles->has('instructor');
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
