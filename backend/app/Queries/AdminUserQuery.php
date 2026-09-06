<?php

namespace App\Queries;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Lista kont dla panelu administracji H18 (`GET /admin/users` oraz
 * `GET /admin/users/export.csv`). Filtry płaskie zgodnie z kontraktem §1:
 * `role`, `status`, `search` (imię, nazwisko, e-mail) i sortowanie `sort`
 * z domyślnym `-created_at`.
 *
 * Kod pakietu (app/Support/ to fasady startera). Wspólne dla listy i CSV,
 * żeby wynik obu tras zawsze zawężał się identycznie (design.md D1/D6).
 */
final class AdminUserQuery
{
    /** Kolumny dopuszczone w parametrze `sort`. */
    private const array SORTABLE = ['created_at', 'last_name', 'email', 'role'];

    public static function fromRequest(Request $request): Builder
    {
        $query = User::query();

        if (($role = trim((string) $request->query('role', ''))) !== '') {
            $query->where('role', $role);
        }

        if (($status = trim((string) $request->query('status', ''))) !== '') {
            $query->where('status', $status);
        }

        if (($search = trim((string) $request->query('search', ''))) !== '') {
            $term = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';

            $query->where(function (Builder $q) use ($term): void {
                $q->where('first_name', 'ilike', $term)
                    ->orWhere('last_name', 'ilike', $term)
                    ->orWhere('email', 'ilike', $term);
            });
        }

        self::applySort($query, (string) $request->query('sort', '-created_at'));

        return $query;
    }

    /**
     * `page`/`per_page` zgodnie z kontraktem §1 (domyślnie 25, maksimum 100).
     */
    public static function perPage(Request $request): int
    {
        return min(max((int) $request->integer('per_page', 25), 1), 100);
    }

    private static function applySort(Builder $query, string $sort): void
    {
        $sort = trim($sort) !== '' ? trim($sort) : '-created_at';
        $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
        $column = ltrim($sort, '-');

        if (! in_array($column, self::SORTABLE, true)) {
            $column = 'created_at';
            $direction = 'desc';
        }

        $query->orderBy($column, $direction);

        if ($column !== 'id') {
            $query->orderBy('id', 'desc');
        }
    }
}
