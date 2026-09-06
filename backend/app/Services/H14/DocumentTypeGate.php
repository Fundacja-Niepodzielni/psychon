<?php

namespace App\Services\H14;

use App\Models\Document;
use App\Models\Edition;
use App\Models\User;
use App\Support\ProgressAggregator;
use App\Support\Settings;

/**
 * Single source of "is this document type available, and why not" (design D2).
 * `GET /documents` renders this directly in `meta.extra.available_types`;
 * `DocumentIssuer` queries the same object and turns the reason into an
 * error code, so the two can never disagree.
 */
final class DocumentTypeGate
{
    /** Profile fields required to generate any document (design D3). */
    public const array REQUIRED_PROFILE_FIELDS = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'pesel',
        'address_street',
        'address_city',
        'address_zip',
    ];

    /** The full `documents.type` dictionary. */
    public const array TYPES = ['volunteer_agreement', 'internship_certificate'];

    /**
     * @return array<string, array{available: bool, reason: ?string, missing_fields?: list<string>, hours_accepted?: string, hours_required?: string, document_id?: int}>
     */
    public static function for(User $user): array
    {
        $edition = Settings::activeEdition();

        $result = [];

        foreach (self::TYPES as $type) {
            $result[$type] = self::evaluate($user, $edition, $type);
        }

        return $result;
    }

    /**
     * @return list<string>
     */
    public static function missingProfileFields(User $user): array
    {
        return array_values(array_filter(
            self::REQUIRED_PROFILE_FIELDS,
            fn (string $field): bool => self::isBlank($user->{$field}),
        ));
    }

    /**
     * @return array{available: bool, reason: ?string, missing_fields?: list<string>, hours_accepted?: string, hours_required?: string, document_id?: int}
     */
    private static function evaluate(User $user, Edition $edition, string $type): array
    {
        $existing = Document::query()
            ->where('user_id', $user->id)
            ->where('edition_id', $edition->id)
            ->where('type', $type)
            ->first();

        if ($existing !== null) {
            return ['available' => false, 'reason' => 'already_generated', 'document_id' => $existing->id];
        }

        $missing = self::missingProfileFields($user);

        if ($missing !== []) {
            return ['available' => false, 'reason' => 'profile_incomplete', 'missing_fields' => $missing];
        }

        if ($type === 'internship_certificate') {
            $hoursAccepted = ProgressAggregator::for($user)['hours_accepted'];
            $hoursRequired = (string) Settings::edition('internship_hours_required');

            if ((float) $hoursAccepted < (float) $hoursRequired) {
                return [
                    'available' => false,
                    'reason' => 'conditions_not_met',
                    'hours_accepted' => $hoursAccepted,
                    'hours_required' => $hoursRequired,
                ];
            }
        }

        return ['available' => true, 'reason' => null];
    }

    private static function isBlank(?string $value): bool
    {
        return $value === null || trim($value) === '';
    }
}
