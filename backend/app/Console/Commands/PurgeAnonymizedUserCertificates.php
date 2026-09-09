<?php

namespace App\Console\Commands;

use App\Models\Certificate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Jednorazowe sprzątanie stanu zastanego (art. 17): konta zanonimizowane
 * zanim `UserAnonymizer::run()` zaczął sam czyścić plik certyfikatu przy
 * każdym uruchomieniu. Nowe uruchomienia procedury domykają to same — ta
 * komenda jest dla wierszy, które już mają `users.anonymized_at` wypełnione
 * z okresu, zanim ta zmiana zaczęła obowiązywać, i gdzie nikt nie odpali
 * procedury drugi raz, żeby przy okazji sprzątnęła po sobie.
 *
 * Plik znika z dysku, `certificates.pdf_path` przechodzi na `null`, wiersz
 * (numer, data wydania) zostaje — dokładnie ten sam wzorzec, co
 * `expireIssuedCertificates()` w `UserAnonymizer`.
 */
class PurgeAnonymizedUserCertificates extends Command
{
    protected $signature = 'certificates:purge-anonymized';

    protected $description = 'Usuwa pliki PDF certyfikatów kont zanonimizowanych wcześniej, zanim procedura zaczęła je sama sprzątać';

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $touched = 0;

        Certificate::query()
            ->whereNotNull('pdf_path')
            ->whereHas('user', fn ($query) => $query->whereNotNull('anonymized_at'))
            ->each(function (Certificate $certificate) use ($disk, &$touched): void {
                if ($disk->exists($certificate->pdf_path)) {
                    $disk->delete($certificate->pdf_path);
                }

                $certificate->update(['pdf_path' => null]);
                $touched++;
            });

        $this->info("Dotknięte certyfikaty: {$touched}");

        return self::SUCCESS;
    }
}
