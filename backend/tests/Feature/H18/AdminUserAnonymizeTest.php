<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\Certificate;
use App\Models\DataExport;
use App\Models\TestAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\H13\CertificatePackageCase;

/**
 * Procedura usunięcia konta (anonimizacja) — punkty 1-3 z sześciu kryterium
 * (umowa · docs/system/06-wymagania-niefunkcjonalne.md §2 pkt 4), część
 * dotycząca niszczenia danych. Pozostałe trzy punkty (komunikat konta
 * wygasłego vs usuniętego, ponowna rejestracja tym samym adresem, 403 dla
 * roli bez uprawnień) mierzy osobny świadek.
 *
 * Oczekiwania pochodzą z kryterium, nie z implementacji: adres i metodę
 * punktu (`POST /admin/users/{id}/anonymize`) wzięto z `routes/api/h18.php`,
 * bo bez tego nie da się wywołać niczego — nazwy kolumn osobowych wzięto ze
 * schematu tabeli `users` (imię, nazwisko, e-mail, telefon, PESEL, adres),
 * nie z kodu procedury.
 */
class AdminUserAnonymizeTest extends CertificatePackageCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::where('email', 'admin@demo.pl')->firstOrFail();
    }

    public function test_results_and_certificates_survive_by_id_but_person_is_unidentifiable(): void
    {
        $ola = $this->ola();

        $attemptsBefore = TestAttempt::where('user_id', $ola->id)->count();
        $certsBefore = Certificate::where('user_id', $ola->id)->count();
        $this->assertGreaterThan(0, $attemptsBefore, 'fixture assumption: Ola ma podejścia do testów');
        $this->assertGreaterThan(0, $certsBefore, 'fixture assumption: Ola ma wydany certyfikat');

        $attemptIds = TestAttempt::where('user_id', $ola->id)->pluck('id')->all();
        $certIds = Certificate::where('user_id', $ola->id)->pluck('id')->all();

        Sanctum::actingAs($this->admin());
        $response = $this->postJson("/api/v1/admin/users/{$ola->id}/anonymize");
        $this->assertLessThan(300, $response->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$response->getStatusCode().' '.$response->getContent());

        // Historia przeżyła: ta sama liczba wierszy, te same id, ten sam klucz obcy.
        $this->assertSame($attemptsBefore, TestAttempt::where('user_id', $ola->id)->count(), 'podejścia do testów zniknęły z historii');
        $this->assertSame($certsBefore, Certificate::where('user_id', $ola->id)->count(), 'wydane certyfikaty zniknęły z historii');
        $this->assertSame($attemptIds, TestAttempt::where('user_id', $ola->id)->pluck('id')->all(), 'id podejść zmieniły się — to nie jest ten sam wiersz');
        $this->assertSame($certIds, Certificate::where('user_id', $ola->id)->pluck('id')->all(), 'id certyfikatów zmieniły się — to nie jest ten sam wiersz');

        // Osoby za nimi nie da się już zidentyfikować z wiersza users.
        $anonymized = $ola->fresh();
        $this->assertNotSame('Ola', $anonymized->first_name, 'imię przeżyło anonimizację');
        $this->assertNotSame('Demo', $anonymized->last_name, 'nazwisko przeżyło anonimizację');
        $this->assertNotSame('ola@demo.pl', $anonymized->email, 'e-mail przeżył anonimizację');
        $this->assertNotSame('+48 600 100 300', $anonymized->phone, 'telefon przeżył anonimizację');
        $this->assertNotSame('85050529842', $anonymized->pesel, 'PESEL przeżył anonimizację');
        $this->assertNotSame('ul. Wzorcowa 3', $anonymized->address_street, 'ulica przeżyła anonimizację');
        $this->assertNotSame('Kraków', $anonymized->address_city, 'miasto przeżyło anonimizację');
        $this->assertNotSame('30-001', $anonymized->address_zip, 'kod pocztowy przeżył anonimizację');
    }

    public function test_export_prepared_before_the_procedure_no_longer_hands_out_the_name(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update([
            'first_name' => 'Ewelina',
            'last_name' => 'Górniak-Wysocka',
            'email' => 'ewelina.wyciek@example.test',
            'phone' => '+48 511 222 111',
            'pesel' => '90010112349',
        ]);
        $grad = $grad->fresh();

        // Eksport gotowy PRZED procedurą (plik na dysku, status ready).
        Sanctum::actingAs($grad);
        $exportId = $this->postJson('/api/v1/me/exports')->json('data.id');
        $this->getJson("/api/v1/me/exports/{$exportId}")->assertJsonPath('data.status', 'ready');
        $exportPath = DataExport::where('public_id', $exportId)->firstOrFail()->file_path;
        Storage::disk('local')->assertExists($exportPath);
        $this->assertStringContainsString(
            'Górniak-Wysocka',
            Storage::disk('local')->get($exportPath),
            'fixture assumption: przygotowany eksport rzeczywiście niesie nazwisko'
        );

        // Certyfikat wydany PRZED procedurą — potrzebny do weryfikacji publicznej.
        Sanctum::actingAs($grad);
        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();

        // Procedura.
        Sanctum::actingAs($this->admin());
        $anonymize = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $anonymize->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$anonymize->getStatusCode().' '.$anonymize->getContent());

        // 1) Eksport przygotowany wcześniej — czy da się go jeszcze pobrać i co jest
        // w środku. `disk->download()` zwraca StreamedResponse, którego treści test
        // HTTP nie buforuje w tym środowisku (`getContent()` wraca pusty ciąg mimo
        // 200) — patrzymy więc na sam plik zarejestrowany w rekordzie eksportu,
        // dokładnie ten, który trasa faktycznie by wysłała.
        Sanctum::actingAs($grad->fresh());
        $download = $this->get("/api/v1/me/exports/{$exportId}/download");
        $this->assertLessThan(500, $download->getStatusCode(), 'trasa pobrania eksportu padła po anonimizacji zamiast odmówić albo obsłużyć');

        $exportAfter = DataExport::where('public_id', $exportId)->first();
        if ($exportAfter !== null && $exportAfter->file_path !== null && Storage::disk('local')->exists($exportAfter->file_path)) {
            $content = Storage::disk('local')->get($exportAfter->file_path);
            $this->assertStringNotContainsString(
                'Górniak-Wysocka',
                $content,
                'eksport przygotowany przed anonimizacją nadal niesie nazwisko po pobraniu'
            );
            $this->assertStringNotContainsString(
                '90010112349',
                $content,
                'eksport przygotowany przed anonimizacją nadal niesie PESEL po pobraniu'
            );
        }

        // 2) Publiczna weryfikacja certyfikatu — bez uwierzytelnienia, po numerze i po QR.
        $verifyByNumber = $this->getJson("/api/v1/verify/{$certificate->number}");
        $verifyByQr = $this->getJson("/api/v1/verify/qr/{$certificate->verification_token}");
        foreach ([$verifyByNumber, $verifyByQr] as $response) {
            $this->assertStringNotContainsString(
                'Górniak-Wysocka',
                $response->getContent(),
                'publiczna weryfikacja certyfikatu niesie nazwisko po anonimizacji'
            );
        }
    }

    /**
     * ZNALEZISKO: PDF certyfikatu wygenerowany PRZED procedurą zostaje na
     * dysku bajt w bajt taki sam, więc nazwisko wypalone w renderze
     * (dompdf, strumień treści FlateDecode) przeżywa anonimizację. Procedura
     * (`UserAnonymizer::expireReadyExports`) czyści eksport RODO, ale nie
     * rusza tabeli `certificates` ani plików pod `certificates.pdf_path`.
     * Świadek pisany z kryterium 052 §3 pkt 2 ("po procedurze żaden punkt
     * API nie oddaje danych osobowych — w tym eksport i PDF certyfikatu")
     * świeci na czerwono na `8ad6133`. Nie naprawiam — to nie mój zakres.
     */
    public function test_certificate_pdf_generated_before_the_procedure_still_carries_the_name(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update([
            'first_name' => 'Ewelina',
            'last_name' => 'Górniak-Wysocka',
        ]);
        $grad = $grad->fresh();

        Sanctum::actingAs($grad);
        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();
        Storage::disk('local')->assertExists($certificate->pdf_path);
        $pdfBytesBefore = Storage::disk('local')->get($certificate->pdf_path);

        Sanctum::actingAs($this->admin());
        $anonymize = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $anonymize->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$anonymize->getStatusCode().' '.$anonymize->getContent());

        $this->assertTrue(
            Storage::disk('local')->exists($certificate->pdf_path),
            'fixture assumption: plik PDF certyfikatu istnieje na dysku po procedurze'
        );
        $pdfBytesAfter = Storage::disk('local')->get($certificate->pdf_path);

        $this->assertNotSame(
            $pdfBytesBefore,
            $pdfBytesAfter,
            'plik PDF certyfikatu na dysku jest identyczny bajt-w-bajt z tym sprzed procedury — nazwisko w PDF nie zostało tknięte przez anonimizację'
        );
    }

    public function test_operation_is_recorded_in_the_audit_log_with_actor_and_timestamp(): void
    {
        $ola = $this->ola();
        $admin = $this->admin();

        $before = AuditLogEntry::count();

        Sanctum::actingAs($admin);
        $response = $this->postJson("/api/v1/admin/users/{$ola->id}/anonymize");
        $this->assertLessThan(300, $response->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$response->getStatusCode().' '.$response->getContent());

        $after = AuditLogEntry::count();
        $this->assertGreaterThan($before, $after, 'operacja anonimizacji nie zostawiła wpisu w dzienniku czynności');

        $entry = AuditLogEntry::latest('id')->first();
        $this->assertNotNull($entry);
        $this->assertSame($admin->id, $entry->actor_id, 'dziennik nie wskazuje wykonawcy operacji');
        $this->assertNotNull($entry->created_at, 'wpis nie ma znacznika czasu');
        $this->assertTrue(
            $entry->created_at->diffInSeconds(now()) < 10,
            'znacznik czasu wpisu nie odpowiada chwili operacji'
        );
    }
}
