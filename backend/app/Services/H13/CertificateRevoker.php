<?php

namespace App\Services\H13;

use App\Exceptions\ApiException;
use App\Models\Certificate;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The one path a certificate is revoked through, wzorem
 * `App\Services\H14\DocumentIssuer`: the row lock, the decision and its
 * audit entry all happen in a single transaction — either everything
 * happens, or nothing does.
 *
 * The PDF file on disk is untouched — only the public verification answer
 * changes (`VerifyController::present()` already reads `revoked_at`).
 * There is no "un-revoke": once set, `revoked_at` never moves back to null.
 */
final class CertificateRevoker
{
    public const string ALREADY_REVOKED_CODE = 'already_revoked';

    public static function revoke(Certificate $certificate, User $actor, string $reason): Certificate
    {
        return DB::transaction(function () use ($certificate, $actor, $reason): Certificate {
            $locked = Certificate::query()->whereKey($certificate->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->revoked_at !== null) {
                // Certificate::casts() rzutuje `revoked_at` na datetime, ale analiza
                // statyczna tego rzutowania nie wyprowadza — stąd lokalne domknięcie typu.
                /** @var Carbon $revokedAt */
                $revokedAt = $locked->revoked_at;

                throw new ApiException(
                    409,
                    self::ALREADY_REVOKED_CODE,
                    'Ten certyfikat został już unieważniony.',
                    reason: ['revoked_at' => $revokedAt->toIso8601ZuluString()],
                );
            }

            $locked->revoked_at = now();
            $locked->revoked_reason = $reason;
            $locked->revoked_by = $actor->id;
            $locked->save();

            AuditLog::record($actor, 'certificate.revoked', $locked, [
                'number' => $locked->number,
                'reason' => $reason,
            ]);

            return $locked;
        });
    }
}
