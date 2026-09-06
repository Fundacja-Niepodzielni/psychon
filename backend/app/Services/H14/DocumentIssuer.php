<?php

namespace App\Services\H14;

use App\Exceptions\ApiException;
use App\Models\Document;
use App\Models\Edition;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\Notify;
use App\Support\PdfService;
use App\Support\ProgressAggregator;
use App\Support\Settings;
use Illuminate\Support\Facades\DB;

/**
 * The one path a document is issued through (design D1): conditions,
 * numbering, snapshot, render, save, notification and audit all happen
 * in a single transaction — either everything happens, or nothing does.
 */
final class DocumentIssuer
{
    /**
     * Fallback error code for the 409 on a repeat generate, pending the
     * contract guardian's decision on the final slug (proposal.md, D5).
     */
    public const string DUPLICATE_CODE = 'document_already_generated';

    private const array NUMBER_PREFIXES = [
        'volunteer_agreement' => 'PW',
        'internship_certificate' => 'ZS',
    ];

    private const array VIEWS = [
        'volunteer_agreement' => 'documents.volunteer-agreement',
        'internship_certificate' => 'documents.internship-certificate',
    ];

    public static function issue(User $user, string $type): Document
    {
        $availability = DocumentTypeGate::for($user)[$type] ?? null;

        if ($availability === null) {
            throw new ApiException(422, 'validation_failed', 'Nieznany typ dokumentu.');
        }

        if (! $availability['available']) {
            throw self::denialFor($availability);
        }

        return DB::transaction(function () use ($user, $type): Document {
            $edition = Edition::query()
                ->whereKey(Settings::activeEdition()->id)
                ->lockForUpdate()
                ->firstOrFail();

            $duplicate = Document::query()
                ->where('user_id', $user->id)
                ->where('edition_id', $edition->id)
                ->where('type', $type)
                ->first();

            if ($duplicate !== null) {
                throw self::duplicateException($duplicate->id);
            }

            $number = self::nextNumber($edition, $type);
            $snapshot = self::buildSnapshot($user, $edition, $type, $number);
            $path = PdfService::render(self::VIEWS[$type], $snapshot);

            $document = Document::create([
                'user_id' => $user->id,
                'edition_id' => $edition->id,
                'type' => $type,
                'number' => $number,
                'data_snapshot' => $snapshot,
                'pdf_path' => $path,
                'generated_at' => now(),
                'signature_status' => 'none',
            ]);

            Notify::send(
                $user,
                'document.ready',
                'Dokument gotowy',
                self::notificationBody($type, $number),
                '/panel/dokumenty',
            );

            AuditLog::record($user, 'document.generated', $document, [
                'type' => $type,
                'number' => $number,
            ]);

            return $document;
        });
    }

    public static function viewFor(string $type): string
    {
        return self::VIEWS[$type] ?? throw new ApiException(422, 'validation_failed', 'Nieznany typ dokumentu.');
    }

    /**
     * @param  array{available: bool, reason: ?string, missing_fields?: list<string>, hours_accepted?: string, hours_required?: string, document_id?: int}  $availability
     */
    private static function denialFor(array $availability): ApiException
    {
        return match ($availability['reason']) {
            'profile_incomplete' => new ApiException(
                422,
                'profile_incomplete',
                'Uzupełnij brakujące pola profilu, aby wygenerować dokument.',
                errors: self::profileErrors($availability['missing_fields']),
            ),
            'conditions_not_met' => new ApiException(
                422,
                'conditions_not_met',
                'Nie osiągnięto jeszcze wymaganej liczby godzin stażu.',
                reason: [
                    'hours_accepted' => $availability['hours_accepted'],
                    'hours_required' => $availability['hours_required'],
                ],
            ),
            'already_generated' => self::duplicateException($availability['document_id']),
            default => new ApiException(422, 'validation_failed', 'Nie można wygenerować dokumentu.'),
        };
    }

    private static function duplicateException(int $documentId): ApiException
    {
        return new ApiException(
            409,
            self::DUPLICATE_CODE,
            'Dokument tego typu został już wygenerowany w tej edycji.',
            reason: ['document_id' => $documentId],
        );
    }

    /**
     * @param  list<string>  $missing
     * @return array<string, list<string>>
     */
    private static function profileErrors(array $missing): array
    {
        $labels = [
            'first_name' => 'Imię jest wymagane, aby wygenerować dokument.',
            'last_name' => 'Nazwisko jest wymagane, aby wygenerować dokument.',
            'email' => 'Adres e-mail jest wymagany, aby wygenerować dokument.',
            'phone' => 'Telefon jest wymagany, aby wygenerować dokument.',
            'pesel' => 'PESEL jest wymagany, aby wygenerować dokument.',
            'address_street' => 'Ulica i numer są wymagane, aby wygenerować dokument.',
            'address_city' => 'Miejscowość jest wymagana, aby wygenerować dokument.',
            'address_zip' => 'Kod pocztowy jest wymagany, aby wygenerować dokument.',
        ];

        $errors = [];

        foreach ($missing as $field) {
            $errors[$field] = [$labels[$field] ?? 'To pole jest wymagane, aby wygenerować dokument.'];
        }

        return $errors;
    }

    /**
     * Continuous per-(type, edition) sequence (design D4): the caller must
     * already hold the edition row lock — Postgres forbids `MAX()` combined
     * with `FOR UPDATE`, so the max is computed in PHP over the locked read.
     */
    private static function nextNumber(Edition $edition, string $type): string
    {
        $prefix = self::NUMBER_PREFIXES[$type];
        $year = $edition->starts_at->year;

        $lastSequence = Document::query()
            ->where('edition_id', $edition->id)
            ->where('type', $type)
            ->pluck('number')
            ->map(fn (string $number): int => (int) substr($number, strrpos($number, '/') + 1))
            ->max() ?? 0;

        return sprintf('%s/%d/%03d', $prefix, $year, $lastSequence + 1);
    }

    /**
     * @return array<string, mixed>
     */
    private static function buildSnapshot(User $user, Edition $edition, string $type, string $number): array
    {
        $snapshot = [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'pesel' => $user->pesel,
            'address_street' => $user->address_street,
            'address_city' => $user->address_city,
            'address_zip' => $user->address_zip,
            'edition_name' => $edition->name,
            'edition_starts_at' => $edition->starts_at->toDateString(),
            'edition_ends_at' => $edition->ends_at->toDateString(),
            'number' => $number,
            'generated_at' => now()->toDateString(),
        ];

        if ($type === 'internship_certificate') {
            $progress = ProgressAggregator::for($user);
            $snapshot['hours_accepted'] = $progress['hours_accepted'];
            $snapshot['consultations_count'] = (int) $user->internshipEntries()
                ->where('status', 'accepted')
                ->sum('consultations_count');
        }

        return $snapshot;
    }

    private static function notificationBody(string $type, string $number): string
    {
        $label = $type === 'volunteer_agreement' ? 'Porozumienie wolontariackie' : 'Zaświadczenie o stażu';

        return "{$label} o numerze {$number} zostało wygenerowane i jest gotowe do pobrania.";
    }
}
