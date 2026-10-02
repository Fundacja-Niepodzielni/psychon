<?php

namespace App\Http\Resources;

use App\Models\AuditLogEntry;
use App\Models\Document;
use App\Models\User;
use App\Services\H12\SupervisorAssignmentService;
use App\Support\ProgressAggregator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Karta osoby w panelu administracji (H18, `GET /admin/users/{id}`),
 * kształt z kontraktu §2 (Panel — osoby): `profile` (jak `/me`, z pełnym
 * PESEL dla administracji), `progress` z jednego agregatora startera,
 * `documents`, `recent_notifications`, `audit_entries` dotyczące tej osoby
 * oraz pola tylko do odczytu `supervisor` i `account`.
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
            // Bez `legal_documents_pending_acceptance` — pole informuje
            // WŁASNĄ osobę na `/me`, co ma jeszcze zaakceptować; na karcie
            // innej osoby (panel) nie ma odbiorcy, a `pendingLegalDocumentAcceptances()`
            // to zapytania o wersje dokumentów, których karta nie potrzebuje.
            'profile' => ProfileResource::withoutPendingLegalDocuments($user)->resolve($request),
            'progress' => [
                'courses_done' => $progress['courses_done'],
                'courses_total' => $progress['courses_total'],
                'hours_accepted' => $progress['hours_accepted'],
                'supervision_present' => $progress['supervision_present'],
                'workshop_done' => $progress['workshop_done'],
                'path_tests_passed' => $progress['path_tests_passed'],
                'path_tests_total' => $progress['path_tests_total'],
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
            // Pola tylko do odczytu: bieżący prowadzący `{id, name}` albo `null`
            // oraz stan i data założenia konta, których `profile` (kształt `/me`) nie niesie.
            'supervisor' => SupervisorAssignmentService::currentSupervisorOf($user),
            'account' => [
                'status' => $user->status,
                'created_at' => $user->created_at?->toIso8601ZuluString(),
            ],
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
