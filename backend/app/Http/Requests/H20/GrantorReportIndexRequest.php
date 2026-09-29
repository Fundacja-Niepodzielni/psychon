<?php

namespace App\Http\Requests\H20;

use Illuminate\Foundation\Http\FormRequest;

/**
 * `GET /admin/report/grantor` (+ `/export.csv`) - zakres dat opcjonalny,
 * kalendarzowy format `RRRR-MM-DD` (jak kazda data kalendarzowa w kontrakcie,
 * nie znacznik czasu). Parametr spoza `from`/`to` jest odrzucany tak samo jak
 * w `ListAdminReliabilityRequest` (H07) - `prohibited` na kazdym nadmiarowym
 * kluczu zapytania.
 */
class GrantorReportIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        $rules = [
            'from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'to' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];

        foreach (array_diff(array_keys($this->query()), array_keys($rules)) as $key) {
            $rules[$key] = ['prohibited'];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'from.date_format' => 'Podaj date poczatkowa w formacie RRRR-MM-DD.',
            'to.date_format' => 'Podaj date koncowa w formacie RRRR-MM-DD.',
            'to.after_or_equal' => 'Data koncowa nie moze byc wczesniejsza niz data poczatkowa.',
            'prohibited' => 'Tego parametru nie obsluguje to zapytanie.',
        ];
    }
}
