<?php

namespace App\Queries;

use App\Models\Certificate;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Lista wydanych certyfikatów dla panelu administracji H13
 * (`GET /admin/certificates`). Filtry płaskie: `number` (dopasowanie
 * dokładne — pole unikalne, nie ma po co szukać częściowo) i `person`
 * (imię, nazwisko, e-mail osoby, której certyfikat wydano).
 */
final class AdminCertificateQuery
{
    /**
     * @return Builder<Certificate>
     */
    public static function fromRequest(Request $request): Builder
    {
        $query = Certificate::query()->with(['user', 'edition']);

        if (($number = trim((string) $request->query('number', ''))) !== '') {
            $query->where('number', $number);
        }

        if (($person = trim((string) $request->query('person', ''))) !== '') {
            $term = '%'.str_replace(['%', '_'], ['\%', '\_'], $person).'%';

            $query->whereHas('user', function (Builder $q) use ($term): void {
                $q->where('first_name', 'ilike', $term)
                    ->orWhere('last_name', 'ilike', $term)
                    ->orWhere('email', 'ilike', $term);
            });
        }

        return $query->orderByDesc('issued_at')->orderByDesc('id');
    }

    /**
     * `page`/`per_page` tą samą konwencją co reszta paneli administracji
     * (domyślnie 25, maksimum 100).
     */
    public static function perPage(Request $request): int
    {
        return min(max((int) $request->integer('per_page', 25), 1), 100);
    }
}
