<?php

namespace Tests\Feature\H15;

use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
use App\Models\User;
use App\Services\H15\ProfileDocumentCipher;
use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\Concerns\WithProfileDocumentEncryptionKey;
use Tests\TestCase;

/**
 * `profile-documents:migrate-encryption` dogania pliki
 * wgrane zanim zapis zaczął szyfrować. Trzy własności:
 * idempotencja, licznik przetworzonych/pominiętych, brak kasowania
 * oryginału przed potwierdzeniem zapisu.
 */
class MigrateProfileDocumentsEncryptionTest extends TestCase
{
    use RefreshDatabase;
    use WithProfileDocumentEncryptionKey;

    private const string PLAINTEXT = 'DOWOD-TRESCI-ZASTANEJ-%PDF-1.4';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->useFreshProfileDocumentEncryptionKey();
    }

    public function test_migrates_a_plaintext_file_in_place_and_counts_it(): void
    {
        [$profile, $document, $path] = $this->legacyPlaintextDocument();

        $this->artisan('profile-documents:migrate-encryption')
            ->assertExitCode(Command::SUCCESS)
            ->expectsOutputToContain('1 zaszyfrowanych, 0 już zaszyfrowanych');

        $this->assertSame($path, $document->fresh()->file_path, 'ścieżka odczytu nie miała się zmienić');

        $onDisk = Storage::disk('local')->get($path);
        $this->assertStringNotContainsString(self::PLAINTEXT, $onDisk, 'plik po migracji nadal jest jawny');
        $this->assertSame(self::PLAINTEXT, (new ProfileDocumentCipher)->decrypt($onDisk), 'zaszyfrowana treść nie odtwarza oryginału');

        $leftoverTmp = collect(Storage::disk('local')->allFiles(dirname($path)))
            ->first(fn (string $file) => str_contains($file, '.migracja-szyfrowania-tmp-'));
        $this->assertNull($leftoverTmp, 'plik tymczasowy migracji nie został posprzątany');

        unset($profile);
    }

    public function test_second_run_is_idempotent_and_counts_the_row_as_already_encrypted(): void
    {
        [, $document] = $this->legacyPlaintextDocument();

        $this->artisan('profile-documents:migrate-encryption')->assertExitCode(Command::SUCCESS);
        $encryptedAfterFirstRun = Storage::disk('local')->get($document->fresh()->file_path);

        $this->artisan('profile-documents:migrate-encryption')
            ->assertExitCode(Command::SUCCESS)
            ->expectsOutputToContain('0 zaszyfrowanych, 1 już zaszyfrowanych');

        $this->assertSame(
            $encryptedAfterFirstRun,
            Storage::disk('local')->get($document->fresh()->file_path),
            'drugi przebieg zmienił zawartość już zaszyfrowanego pliku',
        );
    }

    public function test_row_without_a_file_on_disk_is_skipped_and_reported_not_counted_as_processed(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $profile = PsychologistProfile::create(['user_id' => $graduate->id, 'status' => 'draft']);
        $document = $profile->documents()->create([
            'type' => 'dyplom',
            'file_path' => "profile-documents/{$profile->id}/nieistniejacy.pdf",
            'uploaded_at' => now(),
        ]);

        $this->artisan('profile-documents:migrate-encryption')
            ->assertExitCode(Command::SUCCESS)
            ->expectsOutputToContain('0 zaszyfrowanych, 0 już zaszyfrowanych')
            ->expectsOutputToContain((string) $document->id);
    }

    /**
     * Kontrola bezpieczeństwa zapisu: gdy odczyt tymczasowego pliku PO
     * zapisie nie potwierdza się (symulacja uszkodzonego zapisu), oryginalna
     * ścieżka NIGDY nie dostaje wywołania `put` — jedyny sposób, żeby
     * "nie kasować oryginału przed potwierdzeniem zapisu" był prawdą także
     * wtedy, gdy dysk skłamie.
     */
    public function test_when_the_temporary_write_does_not_confirm_the_original_path_is_never_overwritten(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $profile = PsychologistProfile::create(['user_id' => $graduate->id, 'status' => 'draft']);
        $path = "profile-documents/{$profile->id}/dyplom.pdf";
        $profile->documents()->create([
            'type' => 'dyplom',
            'file_path' => $path,
            'uploaded_at' => now(),
        ]);

        $disk = Mockery::mock(Filesystem::class);
        $disk->shouldReceive('exists')->with($path)->andReturn(true);
        $disk->shouldReceive('get')->with($path)->andReturn(self::PLAINTEXT);
        $disk->shouldReceive('put')
            ->once()
            ->withArgs(fn (string $target) => $target !== $path)
            ->andReturnTrue();
        $disk->shouldReceive('exists')->withArgs(fn (string $target) => $target !== $path)->andReturn(true);
        // Odczyt tymczasowego pliku "kłamie": zwraca coś innego niż to, co
        // przed chwilą pod niego zapisaliśmy — symulacja uszkodzonego zapisu.
        $disk->shouldReceive('get')->withArgs(fn (string $target) => $target !== $path)->andReturn('USZKODZONY-ZAPIS');
        $disk->shouldReceive('delete')->once()->withArgs(fn (string $target) => $target !== $path);
        $disk->shouldNotReceive('put')->withArgs(fn (string $target) => $target === $path);

        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $exitCode = $this->artisan('profile-documents:migrate-encryption')->run();

        $this->assertSame(Command::FAILURE, $exitCode);
    }

    /**
     * @return array{0: PsychologistProfile, 1: ProfileDocument, 2: string}
     */
    private function legacyPlaintextDocument(): array
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $profile = PsychologistProfile::create(['user_id' => $graduate->id, 'status' => 'draft']);
        $path = "profile-documents/{$profile->id}/dyplom.pdf";

        Storage::disk('local')->put($path, self::PLAINTEXT);

        $document = $profile->documents()->create([
            'type' => 'dyplom',
            'file_path' => $path,
            'uploaded_at' => now(),
        ]);

        return [$profile, $document, $path];
    }
}
