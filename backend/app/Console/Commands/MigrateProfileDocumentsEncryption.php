<?php

namespace App\Console\Commands;

use App\Models\ProfileDocument;
use App\Services\H15\ProfileDocumentCipher;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Jednorazowe polecenie po wprowadzeniu szyfrowania załączników wniosku H15:
 * pliki wgrane, zanim zapis zaczął szyfrować, dalej leżą na dysku
 * jawnym tekstem — to polecenie je dogania. Wzorowane na
 * {@see MigrateDocumentPdfStorage}.
 *
 *   - wiersz, którego plik odszyfrowuje się bieżącym kluczem -> już
 *     zaszyfrowany (albo przez poprzedni przebieg tego polecenia, albo przez
 *     bieżący zapis), pomijamy;
 *   - wiersz, którego plik NIE odszyfrowuje się -> traktujemy jako jawny,
 *     szyfrujemy i zapisujemy pod TYM SAMYM `file_path` (ścieżka odczytu się
 *     nie zmienia — zmienia się wyłącznie treść pod nią);
 *   - wiersz bez pliku na dysku -> pomijamy, id trafia na listę do ręcznego
 *     rozstrzygnięcia.
 *
 * Bezpieczeństwo zapisu: szyfrogram idzie NAJPIERW pod tymczasową ścieżkę
 * obok oryginału; dopiero gdy odczyt tej tymczasowej ścieżki odszyfrowuje się
 * z powrotem do IDENTYCZNEJ treści wejściowej, tymczasowy plik zastępuje
 * oryginał, a tymczasowa ścieżka znika. Oryginalna zawartość nie jest
 * kasowana ani nadpisywana przed tym potwierdzeniem — awaria w trakcie
 * zostawia oryginał jawny (do ponownego przebiegu), nigdy pół-zaszyfrowany
 * i nieczytelny.
 *
 * Idempotentne: drugie uruchomienie widzi już-zaszyfrowaną treść pod każdym
 * `file_path` i nic więcej nie robi.
 */
class MigrateProfileDocumentsEncryption extends Command
{
    protected $signature = 'profile-documents:migrate-encryption {--dry-run : tylko licz, nic nie zapisuj}';

    protected $description = 'Szyfruje jawne załączniki wniosku o wpis do bazy psychologów (H15) zapisane przed wprowadzeniem szyfrowania';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $disk = Storage::disk('local');
        $cipher = new ProfileDocumentCipher;

        $processed = 0;
        $alreadyEncrypted = 0;
        /** @var list<int> $missingFile */
        $missingFile = [];

        foreach (ProfileDocument::query()->whereNotNull('file_path')->cursor() as $document) {
            $path = $document->file_path;

            if (! $disk->exists($path)) {
                $missingFile[] = $document->id;

                continue;
            }

            $current = $disk->get($path);

            try {
                $cipher->decrypt($current);
                $alreadyEncrypted++;

                continue;
            } catch (DecryptException) {
                // Nieodszyfrowywalne bieżącym kluczem — traktujemy jako jawną
                // treść sprzed wprowadzenia szyfrowania (patrz opis klasy).
            }

            if ($dryRun) {
                $processed++;

                continue;
            }

            $encrypted = $cipher->encrypt($current);
            $tmpPath = $path.'.migracja-szyfrowania-tmp-'.Str::random(12);

            $disk->put($tmpPath, $encrypted);

            // Potwierdzenie zapisu PRZED dotknięciem oryginału: tymczasowy
            // plik musi odszyfrować się z powrotem do dokładnie tej treści,
            // którą przed chwilą przeczytaliśmy z oryginału. Nieudane
            // odszyfrowanie tymczasowego pliku (dysk uszkodził zapis) liczy
            // się jako brak potwierdzenia, nie jako awaria całego polecenia.
            try {
                $confirmed = $disk->exists($tmpPath) && $cipher->decrypt($disk->get($tmpPath)) === $current;
            } catch (DecryptException) {
                $confirmed = false;
            }

            if (! $confirmed) {
                $disk->delete($tmpPath);

                $this->error("Wiersz {$document->id}: zapis próbny nie potwierdził się, oryginał NIE ruszony.");

                return self::FAILURE;
            }

            $disk->put($path, $disk->get($tmpPath));
            $disk->delete($tmpPath);

            $processed++;
        }

        $this->info(sprintf(
            $dryRun
                ? 'Tryb próbny: %d do zaszyfrowania, %d już zaszyfrowanych.'
                : 'Wykonano: %d zaszyfrowanych, %d już zaszyfrowanych.',
            $processed,
            $alreadyEncrypted,
        ));

        if ($missingFile !== []) {
            $this->warn('Wiersze bez pliku na dysku, pominięte (id): '.implode(', ', $missingFile));
        }

        return self::SUCCESS;
    }
}
