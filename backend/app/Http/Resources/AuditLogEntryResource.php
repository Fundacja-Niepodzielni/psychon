<?php

namespace App\Http\Resources;

use App\Models\AuditLogEntry;
use App\Services\H20\AuditLogMap;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wiersz dziennika działań (H20, `GET /admin/audit`). Ten sam opis wpisu
 * (`toCsvRow`) zasila eksport CSV — kolumny ekranu „Dziennik działań”.
 *
 * `group` i `subject` są czytelne: grupa zdarzenia z `AuditLogMap` oraz
 * „kogo dotyczy” — osoba (z identyfikatorem konta do odnośnika na kartę osoby
 * albo bez niego, gdy to osoba ze zgłoszenia bez konta) i nazwa rzeczy
 * (tytuł kursu, „Wpis w dzienniku stażu”…), nigdy typ techniczny i numer.
 * Opis podmiotu podaje wołający (`withSubject`), policzony paczką dla całej
 * strony w `AdminAuditQuery::subjects`.
 *
 * `subject_type`, `subject_id` i `details` zostają w odpowiedzi listy bez
 * zmian, bo czyta je dotychczasowy ekran dziennika; nowy ekran ich nie używa.
 *
 * @mixin AuditLogEntry
 */
class AuditLogEntryResource extends JsonResource
{
    /**
     * Kolumny wiersza CSV — kolejność wiążąca dla nagłówka; te same nazwy
     * i ta sama kolejność co kolumny ekranu.
     */
    public const array FIELDS = [
        'Kiedy',
        'Rodzaj',
        'Co',
        'Kogo dotyczy',
        'Kto',
    ];

    /** Wykonawca bez konta (zdarzenie zapisane przez system). */
    public const string NO_ACTOR = 'System';

    /** „Kogo dotyczy” wpisu bez osoby i bez nazwanej rzeczy. */
    public const string NOBODY = '—';

    /**
     * @var array{person: array{id: int|null, first_name: string, last_name: string}|null, label: string|null}
     */
    private array $subject = ['person' => null, 'label' => null];

    /**
     * @param  array{person: array{id: int|null, first_name: string, last_name: string}|null, label: string|null}  $subject
     */
    public function withSubject(array $subject): static
    {
        $this->subject = $subject;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'group' => [
                'key' => AuditLogMap::group($this->action),
                'label' => AuditLogMap::groupLabel($this->action),
            ],
            'actor' => $this->actor === null ? null : [
                'id' => $this->actor->id,
                'first_name' => $this->actor->first_name,
                'last_name' => $this->actor->last_name,
            ],
            'subject' => $this->subject,
            'subject_type' => $this->subject_type !== null ? class_basename($this->subject_type) : null,
            'subject_id' => $this->subject_id,
            'details' => $this->details,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
        ];
    }

    /**
     * Płaski wiersz do CSV — kolumny `FIELDS`, wartości jako tekst ekranu:
     * data i godzina po polsku w czasie warszawskim, grupa, zdanie z nazwą
     * rzeczy, „kogo dotyczy” i wykonawca. Bez ładunku zdarzenia.
     *
     * @return array<string, string>
     */
    public function toCsvRow(Request $request): array
    {
        $person = $this->subject['person'];
        $label = $this->subject['label'];
        $sentence = AuditLogMap::sentence($this->action);

        return [
            'Kiedy' => $this->created_at === null
                ? ''
                : $this->created_at->copy()->timezone('Europe/Warsaw')->locale('pl')->isoFormat('D MMMM YYYY, HH:mm'),
            'Rodzaj' => AuditLogMap::groupLabel($this->action),
            'Co' => $person !== null && $label !== null ? $sentence.' · '.$label : $sentence,
            'Kogo dotyczy' => $person !== null
                ? trim($person['first_name'].' '.$person['last_name'])
                : ($label ?? self::NOBODY),
            'Kto' => $this->actor === null
                ? self::NO_ACTOR
                : trim($this->actor->first_name.' '.$this->actor->last_name),
        ];
    }
}
