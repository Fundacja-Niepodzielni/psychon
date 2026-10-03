<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\H12\SupervisorAssignmentService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wiersz listy osób w panelu administracji (H18, `GET /admin/users`).
 * Ten sam zestaw pól zasila eksport CSV (design.md D6).
 *
 * @mixin User
 */
class AdminUserListResource extends JsonResource
{
    /**
     * Kolumny wiersza — kolejność wiążąca dla nagłówka CSV.
     */
    public const array FIELDS = [
        'id',
        'first_name',
        'last_name',
        'email',
        'role',
        'status',
        'product_group',
        'access_expires_at',
        'program_completed_at',
        'created_at',
    ];

    /**
     * Pola tylko do odczytu spoza pliku CSV (nagłówek CSV to wyłącznie
     * `FIELDS`): `supervisor` — bieżący prowadzący `{id, name}` albo `null`.
     * Lista wczytuje przypisania razem z prowadzącym jednym zapytaniem
     * (`AdminUserController::index`).
     */
    public const array READ_ONLY_FIELDS = [
        'supervisor',
    ];

    public function toArray(Request $request): array
    {
        return [
            ...$this->fields(),
            'supervisor' => SupervisorAssignmentService::currentSupervisorOf($this->resource),
        ];
    }

    /**
     * Płaski wiersz do CSV — te same pola, wartości jako stringi.
     *
     * @return array<string, string>
     */
    public function toCsvRow(Request $request): array
    {
        return array_map(
            static fn ($value): string => $value === null ? '' : (string) $value,
            $this->fields(),
        );
    }

    /**
     * Wartości `FIELDS`, w tej samej kolejności.
     *
     * @return array<string, mixed>
     */
    private function fields(): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'role' => $this->role,
            'status' => $this->status,
            'product_group' => $this->product_group,
            'access_expires_at' => $this->access_expires_at?->toIso8601ZuluString(),
            'program_completed_at' => $this->program_completed_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
        ];
    }
}
