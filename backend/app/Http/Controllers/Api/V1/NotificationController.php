<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * H16 · Powiadomienia — dzwonek (bell). Every user only ever sees their own
 * rows; another user's notification by id is a 404 (contract §1.1 — existence
 * of another user's record is never revealed).
 */
class NotificationController extends Controller
{
    /**
     * GET /notifications
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = Notification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $unread = Notification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'data' => NotificationResource::collection($paginator->items())->resolve(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'extra' => ['unread' => $unread],
            ],
        ]);
    }

    /**
     * POST /notifications/{id}/read
     */
    public function read(Request $request, int $id): JsonResponse
    {
        $notification = Notification::query()
            ->where('user_id', $request->user()->id)
            ->find($id);

        if ($notification === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono powiadomienia.');
        }

        if ($notification->read_at === null) {
            $notification->forceFill(['read_at' => now()])->save();
        }

        return response()->json(['data' => NotificationResource::make($notification)->resolve()]);
    }

    /**
     * POST /notifications/read-all
     */
    public function readAll(Request $request): JsonResponse
    {
        $updated = Notification::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['data' => ['updated' => $updated]]);
    }
}
