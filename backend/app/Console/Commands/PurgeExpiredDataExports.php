<?php

namespace App\Console\Commands;

use App\Models\DataExport;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Kasuje pliki eksportów RODO po terminie ważności (S1-12 · H01 · M2 pkt 4).
 *
 * Wiersz zostaje — jest śladem, że uczestnik skorzystał z prawa do kopii danych
 * — ale plik z kompletem danych osobowych znika z dysku, a status przechodzi na
 * `expired`, więc pobranie po terminie kończy się 404.
 */
class PurgeExpiredDataExports extends Command
{
    protected $signature = 'exports:purge-expired';

    protected $description = 'Usuwa pliki eksportów danych osobowych po terminie ważności';

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $removed = 0;

        DataExport::query()
            ->where('status', 'ready')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->each(function (DataExport $export) use ($disk, &$removed): void {
                if ($export->file_path !== null && $disk->exists($export->file_path)) {
                    $disk->delete($export->file_path);
                }

                $export->update(['status' => 'expired', 'file_path' => null]);
                $removed++;
            });

        $this->info("Usunięte paczki eksportu: {$removed}");

        return self::SUCCESS;
    }
}
