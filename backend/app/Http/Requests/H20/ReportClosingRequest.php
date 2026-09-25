<?php

namespace App\Http\Requests\H20;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /admin/reports/closing — raport zamknięcia jednej wskazanej edycji.
 * `edition` wymagany (w odróżnieniu od `ReportIndexRequest::$from`/`$to`,
 * oba opcjonalne) — „zamknięcie" bez wskazanej edycji nie ma znaczenia.
 */
class ReportClosingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'edition' => ['required', 'integer', 'exists:editions,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'edition.required' => 'Podaj edycję.',
            'edition.integer' => 'Edycja musi być liczbą.',
            'edition.exists' => 'Wskazana edycja nie istnieje.',
        ];
    }
}
