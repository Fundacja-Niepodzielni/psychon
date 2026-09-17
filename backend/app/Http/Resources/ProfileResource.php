<?php

namespace App\Http\Resources;

use App\Models\Consent;
use App\Models\LegalDocumentVersion;
use App\Models\User;
use App\Services\Auth\TokenRoles;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET /me — the full self-profile (H01). The owner always sees their own
 * PESEL in full (contract §2, spec M2); masking for other viewers lives on
 * the person card (H18), not here.
 *
 * `roles` (R2, sprint-2 §1): the LOCAL role names the current access token
 * authorises (`TokenRoles::current()`) — a list, since a user may hold
 * several roles at once. `role` stays for backward compatibility (a
 * frontend on another branch routes by it): display/report copy of
 * `users.role`, never consulted for authorisation. This is the route H01
 * overrides `/me` with (`config('features.h01')`) — the starter's
 * `UserResource` carries the same `roles` field for the flag-off shape.
 *
 * @mixin User
 */
class ProfileResource extends JsonResource
{
    /**
     * Karta osoby w panelu (`AdminUserCardResource`, H18) pokazuje ten sam
     * kształt profilu innej osobie (administracji), której `legal_documents_pending_acceptance`
     * nic nie mówi — to pole ma sens wyłącznie na WŁASNYM `/me` (dwa
     * dodatkowe zapytania o wersje dokumentów na każde otwarcie karty, bez
     * żadnego odbiorcy tej informacji). `false` tu wyłącza samo wywołanie
     * `pendingLegalDocumentAcceptances()` — nie tylko ukrywa klucz w odpowiedzi.
     */
    private bool $includePendingLegalDocuments = true;

    public static function withoutPendingLegalDocuments(User $user): self
    {
        $resource = static::make($user);
        $resource->includePendingLegalDocuments = false;

        return $resource;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'role' => $this->role,
            'roles' => app(TokenRoles::class)->current(),
            'phone' => $this->phone,
            'pesel' => $this->pesel,
            'address' => [
                'street' => $this->address_street,
                'city' => $this->address_city,
                'zip' => $this->address_zip,
            ],
            'access_expires_at' => $this->access_expires_at?->toIso8601ZuluString(),
            'program_completed_at' => $this->program_completed_at?->toIso8601ZuluString(),
            'product_group' => $this->product_group,
            'consents' => $this->consents
                ->map(fn (Consent $consent): array => [
                    'type' => $consent->type,
                    'document_version' => $consent->document_version,
                    'granted_at' => $consent->granted_at?->toIso8601ZuluString(),
                    'withdrawn_at' => $consent->withdrawn_at?->toIso8601ZuluString(),
                    'status' => $consent->withdrawn_at !== null ? 'withdrawn' : 'granted',
                ])
                ->values()
                ->all(),
            // Rodzaje dokumentów prawnych (H22) bez zgody na aktualnie bieżącą
            // wersję — brak zgody w ogóle albo zgoda na wersję już nieaktualną.
            // Ta lista tylko informuje; o zablokowaniu innych tras decyduje ekran.
            ...($this->includePendingLegalDocuments
                ? ['legal_documents_pending_acceptance' => $this->pendingLegalDocumentAcceptances()]
                : []),
        ];
    }

    /**
     * @return list<string>
     */
    private function pendingLegalDocumentAcceptances(): array
    {
        $currentByType = LegalDocumentVersion::currentVersionsByType();

        // `sortBy('id')` przed `pluck` jest tu obowiązkowe: przy kilku
        // wpisach zgody tego samego rodzaju (kolejne akceptowane wersje)
        // `pluck` zachowuje ostatnią napotkaną wartość dla klucza — ma to
        // być najnowsza, więc kolejność nie może zależeć od (niezadeklarowanej)
        // kolejności relacji `User::consents()`.
        $grantedVersionByType = $this->consents
            ->whereNull('withdrawn_at')
            ->sortBy('id')
            ->pluck('document_version', 'type');

        $pending = [];
        foreach ($currentByType as $type => $version) {
            if (($grantedVersionByType[$type] ?? null) !== $version) {
                $pending[] = $type;
            }
        }

        return $pending;
    }
}
