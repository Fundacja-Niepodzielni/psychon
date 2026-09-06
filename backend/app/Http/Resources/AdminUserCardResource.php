<?php

namespace App\Http\Resources;

use App\Models\AuditLogEntry;
use App\Models\Document;
use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Karta osoby w panelu administracji (H18, `GET /admin/users/{id}`),
 * kształt z kontraktu §2 (Panel — osoby): `profile` (jak `/me`, z pełnym
 * PESEL dla administracji), `progress` z jednego agregatora startera,
 * `documents`, `recent_notifications` i `audit_entries` dotyczące tej osoby.
 *
 * @mixin User
 */
class AdminUserCardResource extends JsonResource
{
    /** Ile ostatnich wpisów audytu / powiadomień pokazuje karta. */
    private const int RECENT_LIMIT = 20;

    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        $progress = ProgressAggregator::for($user);

        return [
            'profile' => ProfileResource::make($user)->resolve($request),
            'progress' => [
                'courses_done' => $progress['courses_done'],
                'courses_total' => $progress['courses_total'],
                'hours_accepted' => $progress['hours_accepted'],
                'supervision_present' => $progress['supervision_present'],
                'workshop_done' => $progress['workshop_done'],
            ],
            'documents' => $user->documents
                ->map(fn (Document $document): array => [
                    'id' => $document->id,
                    'type' => $document->type,
                    'number' => $document->number,
                ])
                ->values()
                ->all(),
            'recent_notifications' => NotificationResource::collection(
                $user->notifications()
                    ->orderByDesc('created_at')
                    ->orderByDesc('id')
                    ->limit(self::RECENT_LIMIT)
                    ->get()
            )->resolve($request),
            'audit_entries' => AuditLogEntry::query()
                ->where('subject_type', $user->getMorphClass())
                ->where('subject_id', $user->getKey())
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(self::RECENT_LIMIT)
                ->get()
                ->map(fn (AuditLogEntry $entry): array => [
                    'id' => $entry->id,
                    'action' => $entry->action,
                    'actor_id' => $entry->actor_id,
                    'details' => $entry->details,
                    'created_at' => $entry->created_at?->toIso8601ZuluString(),
                ])
                ->values()
                ->all(),
        ];
    }
}
