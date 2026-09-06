<?php

namespace App\Http\Requests\H10;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/tests/{test}/users/{user}/reset-attempts — reset limitu podejść
 * przez opiekuna. Powód obowiązkowy (kryterium 4); brak powodu → 422.
 */
class ResetAttemptsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'reason.required' => 'Podaj powód resetu limitu podejść.',
        ];
    }
}
