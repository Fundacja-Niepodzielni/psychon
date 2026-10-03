<?php

namespace App\Http\Resources;

use App\Models\AuditLogEntry;
use App\Support\AuditDetailsView;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wiersz dziennika działań (H20, `GET /admin/audit`). Ten sam zestaw pól
 * (przez `toCsvRow`) zasila eksport CSV. `details` pokazuje identyfikatory,
 * kody i flagi — bez pól z treścią wpisaną ręcznie (`AuditDetailsView`).
 *
 * @mixin AuditLogEntry
 */
class AuditLogEntryResource extends JsonResource
{
    /**
     * Kolumny wiersza CSV — kolejność wiążąca dla nagłówka.
     */
    public const array FIELDS = [
        'id',
        'action',
        'actor_id',
        'actor_name',
        'subject_type',
        'subject_id',
        'details',
        'created_at',
    ];

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'actor' => $this->actor === null ? null : [
                'id' => $this->actor->id,
                'first_name' => $this->actor->first_name,
                'last_name' => $this->actor->last_name,
            ],
            'subject_type' => $this->subject_type !== null ? class_basename($this->subject_type) : null,
            'subject_id' => $this->subject_id,
            'details' => AuditDetailsView::withoutText($this->details),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
        ];
    }

    /**
     * Płaski wiersz do CSV — pola FIELDS, wartości jako stringi.
     *
     * @return array<string, string>
     */
    public function toCsvRow(Request $request): array
    {
        $details = AuditDetailsView::withoutText($this->details);

        return [
            'id' => (string) $this->id,
            'action' => (string) $this->action,
            'actor_id' => $this->actor_id === null ? '' : (string) $this->actor_id,
            'actor_name' => $this->actor === null
                ? ''
                : trim($this->actor->first_name.' '.$this->actor->last_name),
            'subject_type' => $this->subject_type !== null ? class_basename($this->subject_type) : '',
            'subject_id' => $this->subject_id === null ? '' : (string) $this->subject_id,
            'details' => $details !== null
                ? json_encode($details, JSON_UNESCAPED_UNICODE)
                : '',
            'created_at' => $this->created_at?->toIso8601ZuluString() ?? '',
        ];
    }
}
