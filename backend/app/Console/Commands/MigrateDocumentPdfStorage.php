<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Models\Edition;
use App\Models\User;
use App\Services\H14\DocumentIssuer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Jednorazowe polecenie po zmianie sposobu przechowywania: dokumenty H14 przestały
 * trzymać plik PDF w magazynie — każde pobranie renderuje PDF na żądanie z
 * zaszyfrowanej migawki. To polecenie sprząta to, co narosło, zanim ta
 * zmiana weszła:
 *
 *   - wiersz z migawką i plikiem -> plik jest już zbędny, usuwamy go;
 *   - wiersz z plikiem, ale bez migawki (starszy zapis sprzed migawek) ->
 *     migawkę odtwarzamy z DANYCH DOKUMENTU W BAZIE (użytkownik, edycja),
 *     nie z treści pliku — plik i tak potem znika;
 *   - wiersz bez użytkownika lub edycji (nie da się odtworzyć migawki) ->
 *     pomijamy, id trafia na listę do ręcznego rozstrzygnięcia;
 *   - plik na dysku bez żadnego wiersza, który by na niego wskazywał ->
 *     zostaje: to nie jest ten sam rodzaj ryzyka (nie wiadomo, czyj to
 *     dokument), więc kasowanie na ślepo byłoby zgadywaniem — trafia na
 *     listę w raporcie.
 *
 * Idempotentne: `pdf_path` schodzi do NULL przy każdym przetworzonym
 * wierszu, więc drugie uruchomienie nie znajduje już nic do zrobienia.
 */
class MigrateDocumentPdfStorage extends Command
{
    protected $signature = 'documents:migrate-pdf-storage';

    protected $description = 'Usuwa pliki PDF dokumentów H14 z magazynu po przejściu na render na żądanie';

    public function handle(): int
    {
        $disk = Storage::disk('local');

        // Zbiór "przed" — do wykrycia plików sierot liczy się stan
        // magazynu SPRZED tego przebiegu, nie po nim.
        $referencedBefore = Document::query()
            ->whereNotNull('pdf_path')
            ->pluck('pdf_path')
            ->all();

        $deletedWithSnapshot = 0;
        $rebuiltThenDeleted = 0;
        $unresolved = [];

        foreach (Document::query()->whereNotNull('pdf_path')->cursor() as $document) {
            $path = $document->pdf_path;
            $updates = ['pdf_path' => null];

            if ($document->data_snapshot === null) {
                $user = User::query()->find($document->user_id);
                $edition = Edition::query()->find($document->edition_id);

                if ($user === null || $edition === null) {
                    $unresolved[] = $document->id;

                    continue;
                }

                $updates['data_snapshot'] = DocumentIssuer::buildSnapshot(
                    $user,
                    $edition,
                    $document->type,
                    $document->number,
                    ($document->generated_at ?? $document->created_at)->toDateString(),
                );
                $rebuiltThenDeleted++;
            } else {
                $deletedWithSnapshot++;
            }

            $document->fill($updates)->save();

            if ($path !== null && $disk->exists($path)) {
                $disk->delete($path);
            }
        }

        $orphaned = array_values(array_filter(
            $disk->allFiles('pdf'),
            static fn (string $file): bool => ! in_array($file, $referencedBefore, true),
        ));

        $this->info(sprintf(
            'Wykonano: %d z migawką (plik usunięty), %d bez migawki (migawka odtworzona, plik usunięty), %d nierozstrzygniętych.',
            $deletedWithSnapshot,
            $rebuiltThenDeleted,
            count($unresolved),
        ));

        if ($unresolved !== []) {
            $this->warn('Nierozstrzygnięte id (brak użytkownika lub edycji): '.implode(', ', $unresolved));
        }

        if ($orphaned !== []) {
            $this->warn(sprintf(
                'Pliki bez wiersza w bazie, NIE usunięte (%d): %s',
                count($orphaned),
                implode(', ', $orphaned),
            ));
        }

        return self::SUCCESS;
    }
}
