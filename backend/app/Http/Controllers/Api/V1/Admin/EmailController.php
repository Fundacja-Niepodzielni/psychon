<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmailResource;
use App\Models\EmailMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * H16 · Skrzynka e-maili symulowanych — administracja (#/admin/emails).
 * Nic nigdy nie wychodzi w świat (status zawsze `simulated` na hackathonie).
 */
class EmailController extends Controller
{
    /**
     * GET /admin/emails
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = EmailMessage::query()
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'data' => EmailResource::collection($paginator->items())->resolve(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }
}
