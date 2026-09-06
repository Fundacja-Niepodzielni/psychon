<?php

namespace App\Queries;

use App\Models\AuditLogEntry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Dziennik działań (H20, `GET /admin/audit` oraz `GET /admin/audit/export.csv`).
 * Filtry płaskie zgodnie z kontraktem §2: `action` (slug z rejestru §3.2,
 * walidowany w `AuditIndexRequest`), `user_id` (aktor — kto wykonał akcję),
 * `from`/`to` (zakres dat po `created_at`). Wspólne dla listy i CSV, żeby
 * oba zawężały się identycznie.
 */
final class AdminAuditQuery
{
    public static function fromRequest(Request $request): Builder
    {
        $query = AuditLogEntry::query()->with('actor');

        if (($action = trim((string) $request->query('action', ''))) !== '') {
            $query->where('action', $action);
        }

        if ($request->filled('user_id')) {
            $query->where('actor_id', (int) $request->query('user_id'));
        }

        if ($request->filled('from')) {
            $query->where('created_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $query->where('created_at', '<=', $request->query('to'));
        }

        return $query->orderByDesc('created_at')->orderByDesc('id');
    }

    /**
     * `page`/`per_page` zgodnie z kontraktem §1 (domyślnie 25, maksimum 100).
     */
    public static function perPage(Request $request): int
    {
        return min(max((int) $request->integer('per_page', 25), 1), 100);
    }
}
