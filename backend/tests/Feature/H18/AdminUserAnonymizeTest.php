<?php

namespace Tests\Feature\H18;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Certificate;
use App\Models\DataExport;
use App\Models\ProfileDocument;
use App\Models\PsychologistProfile;
use App\Models\TestAttempt;
use App\Models\User;
use App\Services\H18\UserAnonymizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
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
     * Znany rozjazd procedury anonimizacji: PDF certyfikatu wygenerowany PRZED procedurą zostaje na
     * dysku bajt w bajt taki sam, więc nazwisko wypalone w renderze (dompdf)
     * przeżywa anonimizację. Procedura (`UserAnonymizer::expireReadyExports`)
     * czyści eksport RODO, ale nie rusza tabeli `certificates` ani plików pod
     * `certificates.pdf_path`.
     *
     * Wymaganie (art. 17): po procedurze żaden plik osiągalny przez
     * `certificates.pdf_path` nie niesie nazwiska tej osoby. TO, jak to jest
     * osiągnięte — skasowanie pliku, czy przerenderowanie go bez nazwiska —
     * jest decyzją naprawy, nie tego świadka: obie odpowiedzi mają tu wyjść
     * zielone, świeci się na czerwono tylko trzeci wariant, dzisiejszy —
     * plik zostaje i dalej niesie nazwisko.
     *
     * Nazwisko szuka się nie jako dosłowny ciąg UTF-8: dompdf zapisuje tekst
     * strumieniami skompresowanymi (FlateDecode) w prostym foncie, gdzie
     * każdy znak to 2 bajty UTF-16BE — `pdfBytesContainSurname()` dekompresuje
     * strumienie i szuka tej postaci, zmierzone bezpośrednio na renderze
     * `pdf.certificate` (kontener `psytesty_app`, 09.09).
     */
    public function test_no_certificate_pdf_reachable_after_the_procedure_carries_the_name(): void
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
        $this->assertTrue(
            self::pdfBytesContainSurname(Storage::disk('local')->get($certificate->pdf_path), 'Górniak-Wysocka'),
            'fixture assumption: świeżo wygenerowany PDF certyfikatu rzeczywiście niesie nazwisko'
        );

        Sanctum::actingAs($this->admin());
        $anonymize = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $anonymize->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$anonymize->getStatusCode().' '.$anonymize->getContent());

        $pathAfter = $certificate->fresh()->pdf_path;
        $fileGone = $pathAfter === null || ! Storage::disk('local')->exists($pathAfter);

        $this->assertTrue(
            $fileGone || ! self::pdfBytesContainSurname(Storage::disk('local')->get($pathAfter), 'Górniak-Wysocka'),
            'plik PDF certyfikatu wydanego przed procedurą nadal jest na dysku i nadal niesie nazwisko po anonimizacji — art. 17 wymaga, żeby żaden plik osiągalny przez certificates.pdf_path nie zdradzał tożsamości, obojętnie czy przez skasowanie pliku, czy przez przerenderowanie go bez nazwiska'
        );
    }

    /**
     * Druga noga tego samego wymagania: konto, które **już** przeszło
     * procedurę wcześniej (`anonymized_at` niepuste), a plik certyfikatu
     * mimo to nadal leży na dysku i niesie nazwisko — dokładnie to, co
     * zostawia dzisiejszy kod, gdy ktoś uruchomi procedurę przed naprawą.
     * Stan buduje się tu przez rzeczywiste, jednokrotne wywołanie procedury
     * na dzisiejszym (niepoprawionym) kodzie — nie przez ręczne wstawienie
     * `anonymized_at` — bo to właśnie jest realny sposób, w jaki taki wiersz
     * mógł powstać.
     *
     * Naprawa "od teraz" (procedura czyści plik przy WŁASNYM uruchomieniu)
     * nie wystarcza na taki zastany wiersz: wymaganie ma się domknąć także
     * wtedy, gdy administrator uruchomi procedurę na koncie, które jest już
     * zanonimizowane — punkt API dziś na to odpowiada 409 i nic więcej nie
     * robi, więc plik zostaje. Świadek nie przesądza, czy naprawa domyka to
     * przy drugim wywołaniu tego samego punktu, czy osobnym mechanizmem
     * uruchamianym poza testem (jednorazowe sprzątanie danych) — mierzy
     * wyłącznie stan pliku na końcu tego scenariusza.
     */
    public function test_certificate_pdf_left_over_from_an_earlier_run_still_carries_the_name(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update([
            'first_name' => 'Barbara',
            'last_name' => 'Kowalska-Nowak',
        ]);
        $grad = $grad->fresh();

        Sanctum::actingAs($grad);
        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();
        Storage::disk('local')->assertExists($certificate->pdf_path);
        $this->assertTrue(
            self::pdfBytesContainSurname(Storage::disk('local')->get($certificate->pdf_path), 'Kowalska-Nowak'),
            'fixture assumption: świeżo wygenerowany PDF certyfikatu rzeczywiście niesie nazwisko'
        );

        // Pierwsze uruchomienie — buduje stan "konto już zanonimizowane,
        // plik certyfikatu nietknięty", zastany dziś.
        Sanctum::actingAs($this->admin());
        $first = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $first->getStatusCode(), 'pierwsza procedura anonimizacji nie powiodła się: '.$first->getStatusCode().' '.$first->getContent());
        $this->assertNotNull($grad->fresh()->anonymized_at, 'fixture assumption: konto jest już zanonimizowane przed drugim wywołaniem');

        // Drugie uruchomienie — na koncie zastanym w tym stanie procedura ma
        // domknąć to, co zostawiło pierwsze (albo coś innego ma to zrobić,
        // ale efekt musi być widoczny w tym miejscu).
        $second = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");

        $pathAfter = $certificate->fresh()->pdf_path;
        $fileGone = $pathAfter === null || ! Storage::disk('local')->exists($pathAfter);

        $this->assertTrue(
            $fileGone || ! self::pdfBytesContainSurname(Storage::disk('local')->get($pathAfter), 'Kowalska-Nowak'),
            'plik certyfikatu z konta zanonimizowanego WCZEŚNIEJ nadal niesie nazwisko — naprawa działająca tylko "od teraz" zostawia dane osobowe leżące na dysku (drugie wywołanie procedury zwróciło: '.$second->getStatusCode().' '.$second->getContent().')'
        );
    }

    /**
     * Czy skompresowane (FlateDecode) strumienie treści PDF-a niosą nazwisko.
     * Dompdf koduje tekst w prostych fontach jako UTF-16BE (2 bajty/znak) —
     * dosłowne szukanie ciągu UTF-8 w bajtach (także po dekompresji) nic nie
     * znajduje nawet wtedy, gdy nazwisko naprawdę jest w dokumencie. Metoda
     * nie zakłada NIC o mechanizmie naprawy — działa identycznie na pliku
     * niezmienionym, przerenderowanym bez nazwiska, i na dowolnym innym PDF.
     */
    private static function pdfBytesContainSurname(string $pdfBytes, string $surname): bool
    {
        $needle = mb_convert_encoding($surname, 'UTF-16BE', 'UTF-8');

        if (preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdfBytes, $matches)) {
            foreach ($matches[1] as $stream) {
                $decompressed = @gzuncompress($stream);
                if ($decompressed !== false && str_contains($decompressed, $needle)) {
                    return true;
                }
            }
        }

        return false;
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

    /**
     * F-19: skasowanie pliku z dysku nie podlega wycofaniu transakcji SQL —
     * nie ma czego wycofać, `ROLLBACK` nie przywraca bajtów, które fizycznie
     * zniknęły. Świadek wymusza awarię PO kroku plikowym (zbieranie ścieżek +
     * zerowanie kolumn) przez podpięcie się pod zdarzenie Eloquenta
     * `AuditLogEntry::creating` — `AuditLog::record()` woła je jako ostatni
     * krok WEWNĄTRZ transakcji procedury, więc awaria tam gwarantuje, że
     * krok plikowy już się wykonał. To najmniej inwazyjny z trzech sposobów
     * wymienionych w zleceniu: `AuditLog` to klasa `final` z metodą statyczną
     * (nie da się jej podmienić partial mockiem bez zmiany produkcyjnego
     * kodu), a osobne zdarzenie domenowe dla tej operacji nie istnieje.
     *
     * Na `ac4fda1` cały ciąg — zbieranie ścieżek, zerowanie kolumn, kasowanie
     * plików z dysku — siedzi w jednej transakcji: ta awaria zdąży skasować
     * pliki, zanim dojdzie do `AuditLog::record`, więc rollback cofnie
     * kolumny, ale plików na dysku już nie odzyska — świadek świeci się na
     * czerwono. Po naprawie pliki znikają dopiero w `DB::afterCommit()`,
     * którego ta awaria nigdy nie dopuszcza do zarejestrowania (rzuca, zanim
     * `run()` do niego dojdzie) — nic nie znika z dysku, świadek zielony.
     */
    public function test_file_deletion_does_not_survive_a_rolled_back_transaction(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update([
            'first_name' => 'Renata',
            'last_name' => 'Sokołowska',
            'email' => 'renata.sokolowska@example.test',
            'program_completed_at' => now()->subDay(),
        ]);
        $grad = $grad->fresh();

        Sanctum::actingAs($grad);
        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();
        $certificatePath = $certificate->pdf_path;
        $this->assertTrue(Storage::disk('local')->exists($certificatePath), 'fixture assumption: certyfikat rzeczywiście ma plik na dysku');

        Sanctum::actingAs($grad);
        $diploma = $this->postJson('/api/v1/psychologist-profile/documents', [
            'type' => 'dyplom',
            'file' => UploadedFile::fake()->create('dyplom.pdf', 40, 'application/pdf'),
        ])->assertStatus(201)->json('data');
        $document = ProfileDocument::findOrFail($diploma['id']);
        $documentPath = $document->file_path;
        $this->assertTrue(Storage::disk('local')->exists($documentPath), 'fixture assumption: dokument profilu rzeczywiście ma plik na dysku');

        // Wymuszona awaria PO kroku plikowym procedury.
        AuditLogEntry::creating(function (): void {
            throw new RuntimeException('wymuszona awaria dziennika audytu (świadek F-19)');
        });

        try {
            Sanctum::actingAs($this->admin());
            $response = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");

            $this->assertSame(
                500,
                $response->getStatusCode(),
                'procedura miała eksplodować na wymuszonej awarii dziennika audytu, a zwróciła: '
                    .$response->getStatusCode().' '.$response->getContent()
            );

            $afterFailure = $grad->fresh();
            $this->assertNull($afterFailure->anonymized_at, 'konto wygląda na zanonimizowane mimo wycofanej transakcji');
            $this->assertSame(
                'renata.sokolowska@example.test',
                $afterFailure->email,
                'e-mail zmienił się mimo wycofanej transakcji — kolumny nie zostały cofnięte'
            );

            $this->assertSame(
                $certificatePath,
                $certificate->fresh()->pdf_path,
                'ścieżka certyfikatu zmieniła się mimo wycofanej transakcji'
            );
            $this->assertTrue(
                Storage::disk('local')->exists($certificatePath),
                'plik certyfikatu zniknął z dysku, choć transakcja się wycofała — kasowanie pliku nie podlega rollbackowi (F-19)'
            );

            $this->assertSame(
                $documentPath,
                $document->fresh()->file_path,
                'ścieżka dokumentu profilu zmieniła się mimo wycofanej transakcji'
            );
            $this->assertTrue(
                Storage::disk('local')->exists($documentPath),
                'plik dokumentu profilu zniknął z dysku, choć transakcja się wycofała — kasowanie pliku nie podlega rollbackowi (F-19)'
            );
        } finally {
            AuditLogEntry::flushEventListeners();
        }
    }

    /**
     * F-96: `test_file_deletion_does_not_survive_a_rolled_back_transaction`
     * wymusza awarię WEWNĄTRZ transakcji procedury, w miejscu, gdzie
     * `AuditLog::record()` sam rzuca wyjątek — a to znaczy, że wszystko PO
     * tym wywołaniu (w tym samo `deleteFiles()`, obojętnie czy wołane przez
     * `DB::afterCommit()`, czy wprost) i tak nigdy się nie wykona. Ten
     * świadek zostałby zielony nawet po wycięciu `DB::afterCommit()` i
     * zastąpieniu go bezpośrednim wywołaniem w tym samym miejscu — mutacja
     * nic by w nim nie zmieniła, bo obie wersje kodu nie docierają do tej
     * linii przy tej konkretnej awarii.
     *
     * Ten świadek zamyka tę lukę inaczej: procedura kończy się SUKCESEM (bez
     * żadnej wymuszonej awarii), ale wywołanie siedzi w DODATKOWEJ, ZEWNĘTRZNEJ
     * transakcji, którą wołający wycofuje PO powrocie z procedury. Laravel
     * odkłada callbacki zarejestrowane przez `DB::afterCommit()` do momentu
     * zatwierdzenia NAJBARDZIEJ zewnętrznej transakcji — skoro ta zewnętrzna
     * transakcja nigdy się nie zatwierdza, zarejestrowany callback nigdy nie
     * odpala i plik ma PRZEŻYĆ. Gdyby ktoś zastąpił `DB::afterCommit(...)`
     * bezpośrednim wywołaniem `self::deleteFiles($paths)` w tym samym
     * miejscu (WEWNĄTRZ transakcji procedury, czyli wewnątrz zagnieżdżonego
     * savepointu), plik zniknąłby z dysku natychmiast — zanim zewnętrzna
     * transakcja w ogóle zdąży się wycofać — bo skasowanie pliku z dysku nie
     * jest częścią żadnej transakcji SQL i nie cofa go żaden `ROLLBACK`
     * (F-19). Druga część świadka mierzy nogę pozytywną: zwykłe, zatwierdzone
     * wywołanie procedury (bez żadnej zewnętrznej transakcji dookoła) ma
     * faktycznie skasować plik.
     */
    public function test_files_are_deleted_only_after_the_outermost_transaction_commits(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update(['program_completed_at' => now()->subDay()]);
        $grad = $grad->fresh();

        Sanctum::actingAs($grad);
        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();
        $certificatePath = $certificate->pdf_path;
        $this->assertTrue(Storage::disk('local')->exists($certificatePath), 'fixture assumption: certyfikat rzeczywiście ma plik na dysku');

        $admin = $this->admin();

        // Wywołanie procedury kończy się sukcesem, ale siedzi w DODATKOWEJ,
        // zewnętrznej transakcji, którą wołający tu jawnie wycofuje.
        $caught = null;
        try {
            DB::transaction(function () use ($grad, $admin): void {
                UserAnonymizer::run($grad->fresh(), $admin);

                throw new RuntimeException('wymuszony rollback zewnętrznej transakcji (świadek F-96)');
            });
        } catch (RuntimeException $e) {
            $caught = $e;
        }
        $this->assertNotNull($caught, 'oczekiwano wyjątku wymuszającego rollback zewnętrznej transakcji');
        $this->assertSame('wymuszony rollback zewnętrznej transakcji (świadek F-96)', $caught->getMessage());

        $afterRollback = $grad->fresh();
        $this->assertNull($afterRollback->anonymized_at, 'konto wygląda na zanonimizowane mimo wycofanej zewnętrznej transakcji');
        $this->assertSame(
            $certificatePath,
            $certificate->fresh()->pdf_path,
            'ścieżka certyfikatu zmieniła się mimo wycofanej zewnętrznej transakcji'
        );
        $this->assertTrue(
            Storage::disk('local')->exists($certificatePath),
            'plik certyfikatu zniknął z dysku mimo wycofanej zewnętrznej transakcji — DB::afterCommit() ma czekać na NAJBARDZIEJ zewnętrzny commit, nie na commit wewnętrznej transakcji samej procedury'
        );

        // Noga pozytywna: zwykłe, zatwierdzone (bez zewnętrznej transakcji)
        // wywołanie procedury faktycznie kasuje plik.
        UserAnonymizer::run($grad->fresh(), $admin);
        $this->assertNotNull($grad->fresh()->anonymized_at, 'konto nie zostało zanonimizowane po zatwierdzonym wywołaniu procedury');
        $this->assertFalse(
            Storage::disk('local')->exists($certificatePath),
            'plik certyfikatu przeżył zatwierdzone wywołanie procedury'
        );
    }

    /**
     * K2 (noga C, decyzja D-20260909-21): dyplom i zaświadczenie o
     * niekaralności wgrane PRAWDZIWĄ trasą uploadu
     * (`POST /psychologist-profile/documents`) to cudze załączniki, nie
     * dokumenty wystawione przez Fundację — inaczej niż certyfikat, po
     * anonimizacji ma nie zostać ani wiersz `profile_documents`, ani plik
     * pod jego ścieżką, ani trasa (admina — jedyna, która je wydaje; sam
     * właściciel traci token razem z tożsamością w tej samej procedurze,
     * co mierzy inny świadek H18).
     */
    public function test_profile_documents_uploaded_via_the_real_route_are_deleted_with_their_files(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update(['program_completed_at' => now()->subDay()]);
        $grad = $grad->fresh();

        Sanctum::actingAs($grad);
        $diploma = $this->postJson('/api/v1/psychologist-profile/documents', [
            'type' => 'dyplom',
            'file' => UploadedFile::fake()->create('dyplom.pdf', 40, 'application/pdf'),
        ])->assertStatus(201)->json('data');
        $clearance = $this->postJson('/api/v1/psychologist-profile/documents', [
            'type' => 'niekaralnosc',
            'file' => UploadedFile::fake()->create('niekaralnosc.pdf', 30, 'application/pdf'),
        ])->assertStatus(201)->json('data');

        $profile = PsychologistProfile::where('user_id', $grad->id)->firstOrFail();
        $diplomaDoc = ProfileDocument::findOrFail($diploma['id']);
        $clearanceDoc = ProfileDocument::findOrFail($clearance['id']);
        $this->assertTrue(Storage::disk('local')->exists($diplomaDoc->file_path), 'fixture assumption: dyplom rzeczywiście ma plik na dysku');
        $this->assertTrue(Storage::disk('local')->exists($clearanceDoc->file_path), 'fixture assumption: zaświadczenie rzeczywiście ma plik na dysku');

        $downloadUrl = URL::temporarySignedRoute(
            'admin.profiles.documents.download',
            now()->addMinutes(5),
            ['profileId' => $profile->id, 'docId' => $diplomaDoc->id],
        );
        Sanctum::actingAs($this->admin());
        $this->assertLessThan(300, $this->get($downloadUrl)->getStatusCode(), 'fixture assumption: trasa admina rzeczywiście wydaje dokument przed procedurą');

        Sanctum::actingAs($this->admin());
        $anonymize = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $anonymize->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$anonymize->getStatusCode().' '.$anonymize->getContent());

        $this->assertSame(
            0,
            ProfileDocument::where('profile_id', $profile->id)->count(),
            'wiersze profile_documents przeżyły anonimizację właściciela'
        );
        $this->assertFalse(Storage::disk('local')->exists($diplomaDoc->file_path), 'plik dyplomu nadal jest na dysku po anonimizacji');
        $this->assertFalse(Storage::disk('local')->exists($clearanceDoc->file_path), 'plik zaświadczenia o niekaralności nadal jest na dysku po anonimizacji');

        $downloadAfter = $this->get($downloadUrl);
        $this->assertSame(404, $downloadAfter->getStatusCode(), 'trasa admina nadal wydaje cudzy załącznik po anonimizacji zamiast 404: '.$downloadAfter->getContent());
    }

    /**
     * K3 — ZAŁOŻENIE, odwołalne jednym zdaniem: skan dyplomu ze zgłoszenia
     * (`applications.diploma_scan_path`, H03) traktujemy jak dokumenty
     * profilu wyżej (K2) — cudzy załącznik, który administracja tylko
     * odczytuje (`DiplomaScanAccess`), nigdy nie wystawia. Gdyby produkt
     * zdecydował inaczej (np. skan ma zostać jako dowód decyzji
     * rekrutacyjnej niezależnie od losu konta), ten świadek i odpowiadający
     * mu fragment `UserAnonymizer` trzeba odwrócić — nic więcej w procedurze
     * na tym założeniu nie stoi.
     *
     * Aplikacja nie ma trasy do wgrania skanu plikiem (repozytorium tworzy
     * `diploma_scan_path` przez import CSV/wpis administracyjny, nie przez
     * `UploadedFile`) — fixture stawia plik na dysku fake tak samo, jak robi
     * to jedyny inny świadek tej ścieżki (`ApplicationApiTest::test_diploma_scan_is_admin_only_and_logged`),
     * bo to jest tu najbliższy odpowiednik „prawdziwej trasy".
     */
    public function test_diploma_scan_of_an_accepted_application_is_deleted_by_the_procedure(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();

        $application = Application::factory()->create([
            'edition_id' => $grad->edition_id,
            'user_id' => $grad->id,
            'status' => 'accepted',
            'diploma_scan_path' => "diplomas/{$grad->id}-scan.pdf",
        ]);
        Storage::disk('local')->put($application->diploma_scan_path, '%PDF-demo-diploma');
        $scanPath = $application->diploma_scan_path;

        Sanctum::actingAs($this->admin());
        $before = $this->get("/api/v1/admin/applications/{$application->id}/diploma-scan");
        $this->assertLessThan(300, $before->getStatusCode(), 'fixture assumption: trasa admina rzeczywiście wydaje skan przed procedurą');

        Sanctum::actingAs($this->admin());
        $anonymize = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $anonymize->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$anonymize->getStatusCode().' '.$anonymize->getContent());

        $this->assertNull($application->fresh()->diploma_scan_path, 'kolumna diploma_scan_path przeżyła anonimizację');
        $this->assertFalse(Storage::disk('local')->exists($scanPath), 'plik skanu dyplomu nadal jest na dysku po anonimizacji');

        Sanctum::actingAs($this->admin());
        $after = $this->get("/api/v1/admin/applications/{$application->id}/diploma-scan");
        $this->assertSame(404, $after->getStatusCode(), 'trasa admina nadal wydaje skan dyplomu po anonimizacji zamiast 404: '.$after->getContent());
    }

    /**
     * K5: ścieżka „już zanonimizowane" (409) ma domykać K2 i K3 tak samo, jak
     * dziś domyka certyfikaty (poza transakcją, przed wyjątkiem) — konto
     * zanonimizowane PRZED naprawą nie może zostać z cudzymi załącznikami na
     * dysku.
     *
     * W przeciwieństwie do analogicznego świadka certyfikatu
     * (`test_certificate_pdf_left_over_from_an_earlier_run_still_carries_the_name`)
     * stanu zastanego NIE da się tu zbudować realnym, podwójnym wywołaniem
     * procedury: mechanizm sprzątania dokumentów profilu i skanu dyplomu
     * powstaje w TYM SAMYM commicie co ta naprawa ścieżki 409, więc na
     * kodzie „przed" pierwsze wywołanie i tak nic by nie posprzątało — nie
     * ma więc różnicy między „pierwszym" a „drugim" wywołaniem do zmierzenia.
     * Stan zastany — konto z `anonymized_at` ustawionym, ale cudzymi
     * załącznikami wciąż na dysku — jest więc budowany wprost: dokładnie tak
     * wyglądałby wiersz sprzed dnia, w którym którakolwiek wersja procedury
     * zaczęła to sprzątać. Świadek mierzy wyłącznie to, czy JEDYNE w tym
     * teście wywołanie procedury (kończące się 409) domyka ten stan.
     */
    public function test_already_anonymized_account_leaves_no_profile_document_or_diploma_scan_behind(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update(['program_completed_at' => now()->subDay()]);
        $grad = $grad->fresh();

        $profile = PsychologistProfile::create(['user_id' => $grad->id, 'status' => 'draft']);
        $documentPath = "profile-documents/{$profile->id}/dyplom.pdf";
        Storage::disk('local')->put($documentPath, '%PDF-demo-dyplom');
        $profile->documents()->create([
            'type' => 'dyplom',
            'file_path' => $documentPath,
            'uploaded_at' => now(),
        ]);

        $application = Application::factory()->create([
            'edition_id' => $grad->edition_id,
            'user_id' => $grad->id,
            'status' => 'accepted',
            'diploma_scan_path' => "diplomas/{$grad->id}-legacy-scan.pdf",
        ]);
        $scanPath = $application->diploma_scan_path;
        Storage::disk('local')->put($scanPath, '%PDF-demo-legacy-scan');

        // Konto zanonimizowane z pominięciem procedury — stan zastany, patrz
        // uzasadnienie wyżej.
        $grad->forceFill(['anonymized_at' => now()->subDay(), 'status' => 'deleted'])->save();

        Sanctum::actingAs($this->admin());
        $response = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertSame(409, $response->getStatusCode(), 'konto zastane jako zanonimizowane nie zwróciło 409: '.$response->getContent());

        $this->assertSame(
            0,
            ProfileDocument::where('profile_id', $profile->id)->count(),
            'dokument profilu psychologa przeżył domknięcie stanu zastanego pod 409'
        );
        $this->assertFalse(Storage::disk('local')->exists($documentPath), 'plik dokumentu profilu nadal jest na dysku po domknięciu stanu zastanego');

        $this->assertNull($application->fresh()->diploma_scan_path, 'kolumna diploma_scan_path przeżyła domknięcie stanu zastanego pod 409');
        $this->assertFalse(Storage::disk('local')->exists($scanPath), 'plik skanu dyplomu nadal jest na dysku po domknięciu stanu zastanego');
    }
}
