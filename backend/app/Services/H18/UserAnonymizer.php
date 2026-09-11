<?php

namespace App\Services\H18;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\Certificate;
use App\Models\DataExport;
use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
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
            // Konto już przeszło procedurę wcześniej — ale pliki cudzych
            // załączników (certyfikat, eksport RODO, dokumenty profilu
            // psychologa — K2, skan dyplomu ze zgłoszenia — K3) mogły
            // przetrwać, jeśli to pierwsze przejście zdarzyło się zanim ta
            // metoda zaczęła je sprzątać, albo jeśli samo sprzątanie tamtym
            // razem padło w środku (F-19). Kolejne wywołanie na takim koncie
            // ma domknąć ten stan zastany, nawet gdy samo kończy się odmową:
            // ścieżki są zbierane, a wskazujące na nie kolumny/wiersze
            // czyszczone WEWNĄTRZ własnej, krótkiej transakcji poniżej; same
            // pliki znikają z dysku dopiero PO jej zatwierdzeniu, PRZED
            // wyjątkiem 409 — rollback po 409 nie miałby już czego cofać, bo
            // ta transakcja w tym miejscu jest już zamknięta (K5).
            $paths = DB::transaction(fn (): array => self::collectAndClearResidualFiles($existing));
            self::deleteFiles($paths);

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

            // F-19: skasowanie pliku z dysku nie podlega wycofaniu transakcji
            // — nie ma "DELETE FROM disk" do wycofania. Gdyby cokolwiek PO tym
            // miejscu w tej transakcji padło (np. `AuditLog::record` niżej), a
            // pliki już zniknęłyby z dysku, rollback przywróciłby kolumny
            // (`pdf_path`, `file_path`) i wiersze, ale nie pliki, pod którymi
            // wskazują — żywe konto zostałoby ze złamanym odnośnikiem. Dlatego
            // ta metoda tylko ZBIERA ścieżki i w tej samej transakcji zeruje
            // kolumny / kasuje wiersze, które na nie wskazują; same pliki
            // znikają z dysku dopiero w `DB::afterCommit()` niżej — po
            // zatwierdzeniu WSZYSTKIEGO innego, nigdy przed.
            $paths = self::collectAndClearResidualFiles($user);

            AuditLog::record($actor, 'user.anonymized', $user);

            DB::afterCommit(static function () use ($paths): void {
                self::deleteFiles($paths);
            });

            return $user;
        });
    }

    /**
     * Zbiera ścieżki cudzych załączników do skasowania z dysku i w BIEŻĄCEJ
     * transakcji zeruje/kasuje wiersze, które na nie wskazują. Same pliki nie
     * są tu ruszane (F-19) — to robi wywołujący, PO zatwierdzeniu transakcji,
     * przez `deleteFiles()`. Wołana z dwóch miejsc (świeża anonimizacja i
     * domykanie stanu zastanego pod 409 — K5), bo oba mają zamknąć dokładnie
     * ten sam zestaw załączników.
     *
     * Rozmyślnie NIE rusza (K4, D-20260909-21 „umowy nie znikają"): `documents`
     * (H14 — `data_snapshot`, `pdf_path`), `certificates` jako wiersz i
     * `test_attempts`. To dokumenty WYSTAWIONE przez Fundację, nie cudze
     * załączniki — inna kategoria z innym traktowaniem.
     *
     * @return list<string>
     */
    private static function collectAndClearResidualFiles(User $user): array
    {
        $paths = [];

        // A RODO export generated *before* anonymisation is a JSON file with
        // the real name, PESEL and address already written to disk — the
        // mechanism built for art. 15/20 predates this one and does not know
        // about it. Same treatment `exports:purge-expired` gives an export
        // past its TTL: the row stays (the participant did exercise their
        // right to a copy), the file with the personal data on it does not.
        $user->dataExports()->where('status', 'ready')->get()->each(function (DataExport $export) use (&$paths): void {
            if ($export->file_path !== null) {
                $paths[] = $export->file_path;
            }

            $export->update(['status' => 'expired', 'file_path' => null]);
        });

        // A certificate PDF rendered *before* anonymisation has the name
        // baked into the page by dompdf — a right no `DELETE` on `users`
        // would satisfy, because the row in `certificates` (number, issue
        // date) is the fact we keep on purpose (see class docblock). The
        // file underneath it is not: it exists only to be downloaded by the
        // person it names, and that person no longer has an account to
        // download it with. Public verification (by number, by QR) reads
        // `certificates` columns other than `pdf_path`, so clearing the path
        // does not touch it.
        $user->certificates()->whereNotNull('pdf_path')->get()->each(function (Certificate $certificate) use (&$paths): void {
            $paths[] = $certificate->pdf_path;
            $certificate->update(['pdf_path' => null]);
        });

        // K2 (noga C, decyzja D-20260909-21): dyplom i zaświadczenie o
        // niekaralności wgrane do wniosku o wpis do bazy psychologów
        // (`profile_documents`, H15/`PsychologistProfileController::storeDocument`)
        // to cudzy załącznik, nie dokument wystawiony przez Fundację — inaczej
        // niż certyfikat, wiersz też znika, nie tylko plik: nic w kontrakcie
        // nie trzyma numeru ani daty tego załącznika jako faktu do zachowania.
        // Zapytanie wprost, nie magiczna właściwość relacji (`$user->psychologistProfile`)
        // — ta druga zwraca w tym kodzie generyczny `Model`, na którym `documents()`
        // nie istnieje (PHPStan level 5); ten sam wzorzec zapytania stoi już
        // w `PsychologistProfileController`.
        $profile = PsychologistProfile::query()->where('user_id', $user->id)->first();
        if ($profile !== null) {
            $profile->documents()->get()->each(function (ProfileDocument $document) use (&$paths): void {
                $paths[] = $document->file_path;
                $document->delete();
            });
        }

        // K3 (założenie, odwołalne jednym zdaniem — patrz komentarz świadka):
        // skan dyplomu ze zgłoszenia (`applications.diploma_scan_path`, H03,
        // wydawany administracji przez `DiplomaScanAccess`) jest tym samym
        // rodzajem cudzego załącznika co dokumenty profilu wyżej — Fundacja go
        // tylko odczytuje, nie wystawia. Sam wiersz `applications` zostaje
        // (historia procesu rekrutacji), zeruje się tylko ścieżkę, tak jak przy
        // certyfikacie.
        Application::query()
            ->where('user_id', $user->id)
            ->whereNotNull('diploma_scan_path')
            ->get()
            ->each(function (Application $application) use (&$paths): void {
                $paths[] = $application->diploma_scan_path;
                $application->update(['diploma_scan_path' => null]);
            });

        return array_values(array_filter(
            $paths,
            static fn (?string $path): bool => $path !== null && $path !== '',
        ));
    }

    /**
     * Faktyczne kasowanie z dysku — wołane WYŁĄCZNIE po zatwierdzeniu
     * transakcji, która wyzerowała kolumny/wiersze wskazujące na te ścieżki
     * (F-19). Brak pliku pod ścieżką nie jest tu błędem: ten sam zestaw
     * ścieżek może przejść tędy więcej niż raz (np. `already_anonymized`
     * domyka to, co świeże uruchomienie już posprzątało).
     *
     * @param  list<string>  $paths
     */
    private static function deleteFiles(array $paths): void
    {
        $disk = Storage::disk('local');

        foreach ($paths as $path) {
            if ($disk->exists($path)) {
                $disk->delete($path);
            }
        }
    }
}
