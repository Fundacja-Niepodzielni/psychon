<?php

namespace App\Services\H18;

use App\Exceptions\ApiException;
use App\Models\Certificate;
use App\Models\DataExport;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Right-to-erasure procedure (art. 17): personal data on the account is
 * replaced in place. The row itself is never deleted — results, attempts,
 * certificates and the statistics that reference it all keep a valid
 * `user_id` to point at, they just point at a person nobody can identify
 * any more. A soft delete alone would not do this: the row would still
 * carry the real name and e-mail, `withTrashed()` would hand them straight
 * back.
 */
final class UserAnonymizer
{
    public static function run(User $target, User $actor): User
    {
        $existing = User::query()->whereKey($target->getKey())->first();

        if ($existing === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
        }

        if ($existing->anonymized_at !== null) {
            // Konto już przeszło procedurę wcześniej — ale plik certyfikatu mógł
            // przetrwać, jeśli to pierwsze przejście zdarzyło się zanim ta metoda
            // zaczęła go sprzątać. Kolejne wywołanie na takim koncie ma domknąć
            // ten stan zastany, nawet gdy samo kończy się odmową: sprzątanie
            // dzieje się tu, PRZED wyjątkiem i poza transakcją poniżej, żeby
            // rollback po 409 go nie cofnął.
            self::expireIssuedCertificates($existing);

            throw new ApiException(409, 'already_anonymized', 'Konto zostało już zanonimizowane.');
        }

        return DB::transaction(function () use ($target, $actor): User {
            $user = User::query()->whereKey($target->getKey())->lockForUpdate()->first();

            if ($user === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
            }

            if ($user->anonymized_at !== null) {
                throw new ApiException(409, 'already_anonymized', 'Konto zostało już zanonimizowane.');
            }

            if ($user->id === $actor->id) {
                throw new ApiException(
                    422,
                    'cannot_anonymize_self',
                    'Nie można uruchomić procedury anonimizacji na własnym koncie.',
                );
            }

            // Frees the e-mail immediately: a later registration with the same
            // address is a new person and must not collide with this row on
            // the unique index. The `.invalid` TLD (RFC 2606) guarantees the
            // placeholder is never itself a real, reusable address, and the
            // id keeps it unique across every anonymised account.
            $placeholderEmail = "usuniete-{$user->id}@konto.invalid";

            $user->forceFill([
                'first_name' => 'Konto',
                'last_name' => 'usunięte',
                'email' => $placeholderEmail,
                'password' => null,
                'phone' => null,
                'address_street' => null,
                'address_city' => null,
                'address_zip' => null,
                'pesel' => null,
                'activation_token' => null,
                'status' => 'deleted',
                'anonymized_at' => now(),
            ])->save();

            // Every existing bearer token dies with the identity behind it —
            // otherwise a session opened before the procedure would keep
            // reaching owner-only endpoints (profile, exports, certificate
            // download) after the account is supposed to be unreachable.
            $user->tokens()->delete();

            self::expireReadyExports($user);
            self::expireIssuedCertificates($user);

            AuditLog::record($actor, 'user.anonymized', $user);

            return $user;
        });
    }

    /**
     * A RODO export generated *before* anonymisation is a JSON file with the
     * real name, PESEL and address already written to disk — the mechanism
     * built for art. 15/20 predates this one and does not know about it.
     * Same treatment `exports:purge-expired` gives an export past its TTL:
     * the row stays (the participant did exercise their right to a copy),
     * the file with the personal data on it does not.
     */
    private static function expireReadyExports(User $user): void
    {
        $disk = Storage::disk('local');

        $user->dataExports()->where('status', 'ready')->each(function (DataExport $export) use ($disk): void {
            if ($export->file_path !== null && $disk->exists($export->file_path)) {
                $disk->delete($export->file_path);
            }

            $export->update(['status' => 'expired', 'file_path' => null]);
        });
    }

    /**
     * A certificate PDF rendered *before* anonymisation has the name baked
     * into the page by dompdf — a right no `DELETE` on `users` would
     * satisfy, because the row in `certificates` (number, issue date) is the
     * fact we keep on purpose (see class docblock). The file underneath it
     * is not: it exists only to be downloaded by the person it names, and
     * that person no longer has an account to download it with. Public
     * verification (by number, by QR) reads `certificates` columns other
     * than `pdf_path`, so clearing the path does not touch it.
     */
    private static function expireIssuedCertificates(User $user): void
    {
        $disk = Storage::disk('local');

        $user->certificates()->whereNotNull('pdf_path')->each(function (Certificate $certificate) use ($disk): void {
            if ($disk->exists($certificate->pdf_path)) {
                $disk->delete($certificate->pdf_path);
            }

            $certificate->update(['pdf_path' => null]);
        });
    }
}
