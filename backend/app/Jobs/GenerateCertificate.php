<?php

namespace App\Jobs;

use App\Models\Certificate;
use App\Models\Edition;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\H13\CertificateConditions;
use App\Support\Notify;
use App\Support\PdfService;
use App\Support\Settings;
use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Output\QRMarkupSVG;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Pakiet H13 · wydanie certyfikatu absolwenta w tle.
 *
 * W jednej transakcji: nadanie numeru ciągłego per edycja (`NP/<rok>/<nnn>`),
 * utworzenie rekordu ze snapshotem warunków i tokenem QR, ustawienie
 * `users.program_completed_at` oraz wpis audytowy `certificate.issued`.
 * Render pliku (`PdfService` — stub) następuje po zatwierdzeniu transakcji,
 * żeby ewentualny rollback nie zostawiał pliku-sieroty.
 */
class GenerateCertificate implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $userId) {}

    public function handle(): void
    {
        $user = User::find($this->userId);

        if ($user === null) {
            return; // konto zniknęło zanim worker podniósł zadanie
        }

        // Ponowna kontrola — stan warunków mógł się zmienić od czasu żądania.
        if (! CertificateConditions::for($user)->eligible()) {
            return;
        }

        $edition = Settings::activeEdition();

        [$certificate, $created] = DB::transaction(function () use ($user, $edition): array {
            // Blokada WIERSZA EDYCJI, nie zbioru certyfikatów: `SELECT … FOR UPDATE`
            // na zbiorze pustym nie ma czego zablokować, więc przy pierwszym
            // wydaniu w edycji dwie transakcje policzyły ten sam numer (unikalny
            // indeks zamieniał to w wyjątek i zostawiał dziurę w ciągu). Wiersz
            // edycji istnieje zawsze, więc serializuje też ten przypadek.
            Edition::query()
                ->whereKey($edition->id)
                ->lockForUpdate()
                ->firstOrFail();

            $editionCertificates = Certificate::query()
                ->where('edition_id', $edition->id)
                ->get();

            $existing = $editionCertificates->firstWhere('user_id', $user->id);

            if ($existing !== null) {
                return [$existing, false]; // idempotencja pary (uczestnik, edycja)
            }

            $certificate = Certificate::create([
                'user_id' => $user->id,
                'edition_id' => $edition->id,
                'number' => $this->nextNumber($edition, $editionCertificates),
                'issued_at' => now(),
                'verification_token' => $this->uniqueToken(),
                'conditions_snapshot' => CertificateConditions::for($user)->toArray(),
            ]);

            if ($user->program_completed_at === null) {
                $user->program_completed_at = now();
                $user->save();
            }

            AuditLog::record($user, 'certificate.issued', $certificate, [
                'number' => $certificate->number,
                'edition_id' => $edition->id,
            ]);

            return [$certificate, true];
        });

        // Powtórka zadania po nieudanym renderze musi dokończyć plik: rekord już
        // istnieje ($created === false), więc warunek na samym $created zostawiłby
        // wydany certyfikat bez pliku na zawsze.
        if (! $created && $certificate->pdf_path !== null) {
            return;
        }

        $certificate->update([
            'pdf_path' => PdfService::render('pdf.certificate', [
                'certificate' => $certificate,
                'user' => $user,
                'edition' => $edition,
                'verify_url' => $verifyUrl = self::verifyUrl($certificate),
                'qr_svg' => self::qrSvg($verifyUrl),
            ]),
        ]);

        Notify::send(
            $user,
            'certificate.ready',
            'Certyfikat ukończenia programu jest gotowy',
            "Twój certyfikat {$certificate->number} został wydany. Pobierz go w zakładce Certyfikat.",
            '/panel/certyfikat',
        );
    }

    /**
     * Kolejny numer w edycji: `NP/<rok edycji>/<3 cyfry>` bez dziur.
     *
     * @param  Collection<int, Certificate>  $editionCertificates  wiersze edycji odczytane pod blokadą wiersza edycji
     */
    private function nextNumber(Edition $edition, Collection $editionCertificates): string
    {
        $year = $edition->starts_at?->year ?? now()->year;

        $maxSequence = $editionCertificates
            ->map(static function (Certificate $certificate): int {
                $parts = explode('/', $certificate->number);

                return (int) end($parts);
            })
            ->max() ?? 0;

        return sprintf('NP/%d/%03d', $year, $maxSequence + 1);
    }

    /**
     * Adres, pod który prowadzi kod QR: publiczna weryfikacja po tokenie
     * (trasa z karty H13, `routes/api/h13.php`). Token, nie numer — numer
     * bywa przepisywany ręcznie, token nie wychodzi poza dokument.
     */
    private static function verifyUrl(Certificate $certificate): string
    {
        return url('/api/v1/verify/qr/'.$certificate->verification_token);
    }

    /**
     * Kod QR jako SVG w `data:` URI — bez `gd` i `imagick`, których obraz
     * kontenera nie ma, i bez sięgania do sieci przy renderze.
     *
     * Dlaczego `data:` URI, a nie SVG wklejony wprost w HTML: zmierzone —
     * dompdf pomija inline `<svg>` (dokument urósł wtedy o 112 bajtów, czyli
     * o nic), a ten sam kod podany jako `src` obrazka rysuje się poprawnie.
     */
    private static function qrSvg(string $url): string
    {
        return (new QRCode(new QROptions([
            'outputInterface' => QRMarkupSVG::class,
            'outputBase64' => true,
            'eccLevel' => EccLevel::M,
            'addQuietzone' => true,
            'drawCircularModules' => false,
        ])))->render($url);
    }

    private function uniqueToken(): string
    {
        do {
            $token = Str::random(40);
        } while (Certificate::where('verification_token', $token)->exists());

        return $token;
    }
}
