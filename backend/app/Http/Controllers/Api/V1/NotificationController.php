<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H16\UpdateNotificationPreferencesRequest;
use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Support\NotificationTypes;
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
     * POST /notifications/{id}/unread
     */
    public function unread(Request $request, int $id): JsonResponse
    {
        $notification = $this->ownOrFail($request, $id);

        if ($notification->read_at !== null) {
            $notification->forceFill(['read_at' => null])->save();
        }

        return response()->json(['data' => NotificationResource::make($notification)->resolve()]);
    }

    /**
     * DELETE /notifications/{id}
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->ownOrFail($request, $id)->delete();

        return response()->json(['data' => ['id' => $id]]);
    }

    /**
     * GET /notifications/preferences
     */
    public function preferences(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->preferenceList($request->user())]);
    }

    /**
     * PUT /notifications/preferences
     */
    public function updatePreferences(UpdateNotificationPreferencesRequest $request): JsonResponse
    {
        $user = $request->user();

        foreach ($request->validated('preferences') as $preference) {
            NotificationPreference::query()->updateOrCreate(
                ['user_id' => $user->id, 'type' => $preference['type']],
                ['email' => (bool) $preference['email']],
            );
        }

        return response()->json(['data' => $this->preferenceList($user)]);
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

    private function ownOrFail(Request $request, int $id): Notification
    {
        $notification = Notification::query()
            ->where('user_id', $request->user()->id)
            ->find($id);

        if ($notification === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono powiadomienia.');
        }

        return $notification;
    }

    /**
     * Every known type with the person's e-mail choice; a type without a stored
     * row reports the default (`email: true`).
     *
     * @return list<array{type: string, email: bool}>
     */
    private function preferenceList(User $user): array
    {
        $stored = NotificationPreference::query()
            ->where('user_id', $user->id)
            ->pluck('email', 'type');

        return array_map(
            fn (string $type): array => ['type' => $type, 'email' => (bool) ($stored[$type] ?? true)],
            NotificationTypes::ALL,
        );
    }
}
