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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Pakiet H13 · wydanie certyfikatu absolwenta w tle.
 *
 * W jednej transakcji: nadanie numeru ciągłego w roku, wspólnego dla wszystkich
 * edycji (`NP/<rok>/<nnn>`, numer unikalny w całej Fundacji), utworzenie rekordu
 * ze snapshotem warunków i tokenem QR, ustawienie `users.program_completed_at`
 * oraz wpis audytowy `certificate.issued`. Render pliku (`PdfService` — stub)
 * następuje po zatwierdzeniu transakcji, żeby ewentualny rollback nie zostawiał
 * pliku-sieroty.
 */
class GenerateCertificate implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Blokada doradcza PostgreSQL na numerację certyfikatów jest zawsze
     * przestrzeni „numeracja certyfikatów w roku" — `hashtext()` na tym stałym
     * napisie odróżnia jej klucz od innych ewentualnych blokad doradczych,
     * gdyby kiedyś się pojawiły.
     */
    private const NUMBER_LOCK_NAMESPACE = 'certificates.number:year';

    /**
     * `$editionId` pozwala wskazać edycję inną niż aktualnie aktywna. Program
     * trzyma jedną aktywną edycję naraz, więc zwykłe wydanie (kontroler) go nie
     * podaje — wtedy liczy się aktywna edycja jak dotąd. Parametr istnieje, żeby
     * dało się wydać certyfikat wprost w konkretnej, już zamkniętej edycji przy
     * pomiarze numeracji między edycjami tego samego roku.
     */
    public function __construct(public int $userId, private ?int $editionId = null) {}

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

        $edition = $this->editionId !== null
            ? Edition::findOrFail($this->editionId)
            : Settings::activeEdition();

        [$certificate, $created] = DB::transaction(function () use ($user, $edition): array {
            $year = $edition->starts_at?->year ?? now()->year;

            // Blokada doradcza na klucz ROKU, nie wiersz edycji: numer certyfikatu
            // jest unikalny w całej Fundacji (`certificates.number UNIQUE`), więc
            // trzeba serializować WSZYSTKIE edycje danego roku względem siebie
            // nawzajem, nie tylko wiersze jednej edycji. Blokada wiersza edycji
            // (poprzedni kod) nie widziała drugiej edycji — dwie transakcje w
            // różnych edycjach potrafiły policzyć ten sam numer równolegle, a
            // druga padała na unikalnym indeksie. Klucz roku to liczba, nie wiersz
            // w tabeli — istnieje zawsze, więc serializuje też pierwsze wydanie w
            // roku, kiedy zbiór certyfikatów jest pusty. Blokada transakcyjna
            // (`_xact_`) zwalnia się sama na COMMIT/ROLLBACK.
            DB::select(
                'select pg_advisory_xact_lock(hashtext(?), ?)',
                [self::NUMBER_LOCK_NAMESPACE, $year],
            );

            $existing = Certificate::query()
                ->where('edition_id', $edition->id)
                ->where('user_id', $user->id)
                ->first();

            if ($existing !== null) {
                return [$existing, false]; // idempotencja pary (uczestnik, edycja)
            }

            $certificate = Certificate::create([
                'user_id' => $user->id,
                'edition_id' => $edition->id,
                'number' => $this->nextNumber($year),
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
        // wydany certyfikat bez pliku na zawsze. Strażnik sprawdza ARTEFAKT, nie
        // kolumnę: `pdf_path` obecne w wierszu niczego nie dowodzi (ziarno demo
        // niesie zaślepkowe ścieżki `.html` sprzed wejścia dompdf, katalog na
        // dysku może nie istnieć wcale) — luka domykana pomiarem artefaktu.
        if (! $created && self::hasRenderedPdf($certificate)) {
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
     * Kolejny numer w ROKU: `NP/<rok>/<3 cyfry>` bez dziur, wspólny dla
     * wszystkich edycji tego roku — maksimum liczone po WSZYSTKICH
     * certyfikatach z prefiksem `NP/<rok>/`, nie tylko tej jednej edycji.
     */
    private function nextNumber(int $year): string
    {
        $prefix = sprintf('NP/%d/', $year);

        $maxSequence = Certificate::query()
            ->where('number', 'like', $prefix.'%')
            ->pluck('number')
            ->map(static function (string $number): int {
                $parts = explode('/', $number);

                return (int) end($parts);
            })
            ->max() ?? 0;

        return $prefix.sprintf('%03d', $maxSequence + 1);
    }

    /**
     * Adres, pod który prowadzi kod QR i link pod nim: publiczna STRONA
     * weryfikacji z tokenem. Osoba skanująca kod ma zobaczyć stronę, nie JSON —
     * `GET /api/v1/verify/qr/{token}` zostaje punktem maszynowym, który ta
     * strona woła. Token, nie numer: numer bywa przepisywany ręcznie, token
     * nie wychodzi poza dokument.
     */
    private static function verifyUrl(Certificate $certificate): string
    {
        $base = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return $base.'/certyfikat?token='.$certificate->verification_token;
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

    /**
     * Prawda tylko gdy artefakt naprawdę istnieje: ścieżka wypełniona, plik
     * obecny na dysku, niepusty i zaczynający się od nagłówka `%PDF-` — nie
     * wystarczy, że kolumna coś mówi, ani że plik ma rozszerzenie `.pdf`.
     * Zaślepka sprzed dompdf zapisywała surowy HTML pod nazwą `.html`; taką
     * ścieżkę ta metoda traktuje jak brak artefaktu.
     */
    private static function hasRenderedPdf(Certificate $certificate): bool
    {
        if ($certificate->pdf_path === null) {
            return false;
        }

        $disk = Storage::disk('local');

        if (! $disk->exists($certificate->pdf_path)) {
            return false;
        }

        if ($disk->size($certificate->pdf_path) === 0) {
            return false;
        }

        return str_starts_with($disk->get($certificate->pdf_path), '%PDF-');
    }
}
