<?php

namespace App\Console\Commands;

use App\Models\DataExport;
use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

/**
 * Kasuje pliki eksportów RODO po terminie ważności (S1-12 · H01 · M2 pkt 4).
 *
 * Wiersz zostaje — jest śladem, że uczestnik skorzystał z prawa do kopii danych
 * — ale plik z kompletem danych osobowych znika z dysku, a status przechodzi na
 * `expired`, więc pobranie po terminie kończy się 404.
 *
 * Uwaga: powyższe działa tylko, gdy
 * wiersz jeszcze istnieje. Plik może zostać osierocony — bez wiersza w ogóle
 * (współdzielony dysk obok `RefreshDatabase` w suicie testów) albo z wierszem,
 * który zniknął przez `cascadeOnDelete()` na `data_exports.user_id` (usunięcie
 * konta, `User::forceDelete()`) zanim ten mechanizm zdążył go wygasić. Dlatego
 * `purgeOrphanedFiles()` dodatkowo przeszukuje katalog `exports/` na dysku
 * i usuwa pliki bez odpowiadającego wiersza, starsze niż ten sam TTL.
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

        $removed += $this->purgeOrphanedFiles($disk);

        $this->info("Usunięte paczki eksportu: {$removed}");

        return self::SUCCESS;
    }

    /**
     * Pliki tego mechanizmu (katalog `exports/`, wzorzec nazwy z
     * `DataExport::generatePublicId()` + rozszerzenie z `GenerateDataExport`)
     * bez żywego wiersza w `data_exports`, starsze niż `exports.ttl_hours`.
     * Dopasowanie po nazwie chroni przed dotknięciem czegokolwiek spoza tego
     * mechanizmu, gdyby ktoś kiedyś dorzucił coś innego do tego katalogu.
     */
    private function purgeOrphanedFiles(Filesystem $disk): int
    {
        $cutoff = now()->subHours((int) config('exports.ttl_hours'))->getTimestamp();
        $knownPaths = DataExport::query()->whereNotNull('file_path')->pluck('file_path')->all();
        $removed = 0;

        foreach ($disk->files('exports') as $path) {
            if (! preg_match('/^exports\/ex_[a-z0-9]{9}\.json$/', $path)) {
                continue;
            }

            if (in_array($path, $knownPaths, true)) {
                continue;
            }

            $modifiedAt = $disk->lastModified($path);

            if ($modifiedAt !== false && $modifiedAt <= $cutoff) {
                $disk->delete($path);
                $removed++;
            }
        }

        return $removed;
    }
}
