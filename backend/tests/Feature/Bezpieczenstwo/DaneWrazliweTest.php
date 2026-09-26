<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\AuditLogEntry;
use App\Models\DataExport;
use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby luk z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V7.1.2, V8.3.5, V8.3.7 i V8.3.8.
 *
 * Dotyczy ścieżek kodu z danymi osobowymi uczestniczek: audytu wglądu, szyfrowania
 * plików na dysku i usuwania danych. Wszystkie dane w próbach są syntetyczne.
 */
class DaneWrazliweTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    public function test_powod_blokady_nie_trafia_do_ladunku_audytu(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V7.1.2: wolny tekst powodu trafia do rejestru zdarzeń.');

        $osoba = User::factory()->create();
        $this->actingAsRole('super_admin');

        $this->postJson("/api/v1/admin/users/{$osoba->id}/block", [
            'reason' => 'Powód wpisany ręcznie w formularzu.',
        ])->assertOk();

        $wpis = AuditLogEntry::query()->where('action', 'user.blocked')->sole();

        $this->assertArrayNotHasKey('reason', (array) $wpis->details);
    }

    public function test_odczyt_karty_osoby_jest_audytowany(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.3.5: odczyt karty osoby z PESEL nie zostawia śladu.');

        $osoba = User::factory()->create();
        $this->actingAsRole('project_manager');

        $this->getJson("/api/v1/admin/users/{$osoba->id}")->assertOk();

        $this->assertTrue(AuditLogEntry::query()
            ->where('action', 'sensitive.viewed')
            ->where('subject_id', $osoba->id)
            ->exists());
    }

    public function test_eksport_csv_osob_jest_audytowany(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.3.5: eksport CSV osób nie zostawia śladu.');

        User::factory()->count(3)->create();
        $this->actingAsRole('project_manager');

        $this->get('/api/v1/admin/users/export.csv')->assertOk()->streamedContent();

        $this->assertTrue(AuditLogEntry::query()->where('action', 'sensitive.viewed')->exists());
    }

    public function test_plik_eksportu_rodo_jest_zaszyfrowany_na_dysku(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.3.7: plik eksportu RODO leży na dysku jawnym tekstem.');

        Storage::fake('local');
        $osoba = $this->actingAsRole('volunteer');

        $this->postJson('/api/v1/me/exports')->assertStatus(202);

        $eksport = DataExport::query()->where('user_id', $osoba->id)->sole();
        $zawartosc = (string) Storage::disk('local')->get((string) $eksport->file_path);

        $this->assertStringNotContainsString($osoba->email, $zawartosc);
    }

    public function test_anonimizacja_czysci_profil_psychologa(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.3.8: anonimizacja pomija treści profilu psychologa.');

        $osoba = User::factory()->create();
        $profil = PsychologistProfile::query()->create([
            'user_id' => $osoba->id,
            'status' => 'draft',
            'bio' => 'Opis syntetyczny.',
            'city' => 'Miasto',
        ]);
        $this->actingAsRole('super_admin');

        $this->postJson("/api/v1/admin/users/{$osoba->id}/anonymize")->assertOk();

        $profil->refresh();
        $this->assertNull($profil->bio);
        $this->assertNull($profil->city);
    }

    public function test_wycofanie_zgody_usuwa_zalaczniki(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.3.8: wycofanie zgody nie usuwa załączników.');

        Storage::fake('local');
        $osoba = $this->actingAsRole('volunteer');
        $profil = PsychologistProfile::query()->create(['user_id' => $osoba->id, 'status' => 'submitted']);
        $osoba->consents()->create(['type' => 'publikacja_profilu', 'granted_at' => now()->subDay()]);
        Storage::disk('local')->put("profile-documents/{$profil->id}/dyplom.pdf", '%PDF-1.4 próba');
        $profil->documents()->create([
            'type' => 'dyplom',
            'file_path' => "profile-documents/{$profil->id}/dyplom.pdf",
            'uploaded_at' => now(),
        ]);

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();

        Storage::disk('local')->assertMissing("profile-documents/{$profil->id}/dyplom.pdf");
        $this->assertSame(0, ProfileDocument::query()->count());
    }
}
