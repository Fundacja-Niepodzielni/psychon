<?php

namespace Tests\Feature\H01;

use App\Models\DataExport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * S1-12 · świadek pisany Z KRYTERIUM (`ZLECENIE-001` §2.1 + założenie §5.2).
 *
 * Kryterium: 10× `POST /me/exports` w minucie → **1 job w kolejce** (reszta odrzucona);
 * plik znika po TTL (test z przesuniętym zegarem).
 *
 * Dlaczego to nie jest kosmetyka: eksport RODO zawiera PESEL i adres w postaci jawnej.
 * Dziesięć żądań to dziesięć plików z danymi osobowymi leżących bez terminu ważności —
 * to jest wyciek rozłożony w czasie, nie problem wydajności.
 *
 * ⚠ KOD ODMOWY — zgłoszony rozjazd, świadek go NIE przesądza. Kryterium §2.1 mówi
 * „reszta 429/409 wg kontraktu", ale **tabela decyzyjna kontraktu §1.1 nie zna 429**;
 * ma 409 dla „wyścigu o ograniczony zasób (limit miejsc, duplikat unikalny)".
 * Dlatego świadek wymaga odmowy ze zbioru {409, 429} i sprawdza to, co jest
 * NIESPORNE i mierzalne: **liczbę powstałych eksportów**. Test wymuszający jeden
 * konkretny kod kupowałby precyzję za cenę zgadywania, a rozstrzygnięcie należy
 * do aneksu kontraktu, nie do testu.
 *
 * ⚠ Czerwony do czasu pozycji S1-12 (zakres KOD-DOPIECIA). Nie naprawiam.
 *
 * `php artisan test --filter=DataExportLimits`
 */
class DataExportLimitsTest extends TestCase
{
    use RefreshDatabase;

    /** TTL pliku eksportu wg założenia `ZLECENIE-001` §5.2. */
    private const TTL_GODZIN = 24;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_ten_requests_in_a_minute_produce_exactly_one_export(): void
    {
        $marta = $this->actingAsMarta();

        $odpowiedzi = [];
        for ($i = 0; $i < 10; $i++) {
            $odpowiedzi[] = $this->postJson('/api/v1/me/exports')->status();
        }

        $eksporty = DataExport::where('user_id', $marta->id)->count();

        $this->assertSame(
            1,
            $eksporty,
            'Powstało '.$eksporty.' eksportów zamiast jednego. Każdy z nich to osobny plik '
            .'z PESEL-em i adresem w postaci jawnej. Statusy odpowiedzi: '.implode(', ', $odpowiedzi),
        );
    }

    public function test_the_first_request_is_accepted_and_the_rest_are_refused(): void
    {
        // KONTROLA POZYTYWNA do powyższej. „Jeden eksport" spełniłby też serwer,
        // który odrzuca WSZYSTKO — łącznie z pierwszym, uprawnionym żądaniem.
        $this->actingAsMarta();

        $pierwszy = $this->postJson('/api/v1/me/exports');

        $this->assertContains(
            $pierwszy->status(),
            [200, 201, 202],
            'Pierwsze żądanie eksportu zostało odrzucone — to nie jest limit, to awaria.',
        );

        $drugi = $this->postJson('/api/v1/me/exports')->status();

        $this->assertContains(
            $drugi,
            [409, 429],
            'Drugie żądanie przy trwającym eksporcie dostało '.$drugi.'. '
            .'Oczekiwana odmowa: 409 (kontrakt §1.1 — duplikat unikalny) albo 429 (throttle).',
        );
    }

    public function test_a_refusal_uses_the_error_envelope(): void
    {
        // Odmowa musi być czytelna dla frontu tak samo jak każdy inny błąd —
        // inaczej ekran pokaże „coś poszło nie tak" zamiast powodu.
        $this->actingAsMarta();

        $this->postJson('/api/v1/me/exports');

        $this->postJson('/api/v1/me/exports')
            ->assertJsonStructure(['error' => ['status', 'code', 'message']]);
    }

    public function test_another_user_is_not_blocked_by_someone_elses_export(): void
    {
        // KONTROLA NEGATYWNA limitu: ogranicznik liczony globalnie zamiast na osobę
        // przeszedłby oba testy wyżej, a odciąłby wszystkim eksport RODO — czyli
        // uprawnienie, którego odmówić nie wolno.
        $this->actingAsMarta();
        $this->postJson('/api/v1/me/exports');

        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();
        $this->actingAs($ola, 'sanctum');

        $this->assertContains(
            $this->postJson('/api/v1/me/exports')->status(),
            [200, 201, 202],
            'Eksport innej osoby został zablokowany przez cudze żądanie — limit liczy się globalnie.',
        );
    }

    public function test_a_ready_export_carries_an_expiry(): void
    {
        $marta = $this->actingAsMarta();

        $this->postJson('/api/v1/me/exports');

        $this->assertTrue(
            Schema::hasColumn('data_exports', 'expires_at'),
            'Tabela `data_exports` nie ma kolumny `expires_at` — plik z danymi osobowymi '
            .'nie ma terminu ważności, więc nie ma czego sprzątać.',
        );

        $eksport = DataExport::where('user_id', $marta->id)->firstOrFail();

        $this->assertNotNull($eksport->expires_at, 'Eksport powstał bez terminu ważności.');
    }

    public function test_the_file_is_gone_after_the_ttl(): void
    {
        $marta = $this->actingAsMarta();

        $this->postJson('/api/v1/me/exports');

        $eksport = DataExport::where('user_id', $marta->id)->firstOrFail();
        $sciezka = $eksport->file_path;

        $this->assertNotNull($sciezka, 'Eksport nie wskazuje pliku — nie ma czego wygaszać.');
        $this->assertTrue(Storage::disk('local')->exists($sciezka), 'Plik eksportu nie powstał.');

        // Zegar przesunięty PONAD termin. `schedule:run` zamiast nazwy polecenia:
        // świadek pilnuje SKUTKU z kryterium, a nie tego, jak wykonawca nazwie zadanie.
        $this->travel(self::TTL_GODZIN + 1)->hours();
        $this->artisan('schedule:run');

        $this->assertFalse(
            Storage::disk('local')->exists($sciezka),
            'Plik eksportu z PESEL-em i adresem przetrwał swój termin ważności.',
        );
    }

    public function test_downloading_an_expired_export_is_refused(): void
    {
        // Skasowanie pliku bez zamknięcia trasy zostawia 500 albo pusty plik.
        // Wygaszony eksport ma odmawiać tak samo jak nieistniejący.
        $marta = $this->actingAsMarta();

        $this->postJson('/api/v1/me/exports');
        $eksport = DataExport::where('user_id', $marta->id)->firstOrFail();

        $this->travel(self::TTL_GODZIN + 1)->hours();
        $this->artisan('schedule:run');

        $this->assertContains(
            $this->get("/api/v1/me/exports/{$eksport->public_id}/download")->status(),
            [404, 410],
            'Pobranie wygaszonego eksportu nie zostało odrzucone.',
        );
    }

    public function test_a_foreign_export_is_not_found(): void
    {
        // Regresja kryterium H01.3 („pobranie cudzego → 404"). Zmiany limitów
        // nie mają prawa poluzować własności. Ten test jest zielony DZIŚ.
        $this->actingAsMarta();
        $this->postJson('/api/v1/me/exports');
        $martaExport = DataExport::orderByDesc('id')->firstOrFail();

        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();
        $this->actingAs($ola, 'sanctum');

        $this->getJson("/api/v1/me/exports/{$martaExport->public_id}")->assertNotFound();
    }

    private function actingAsMarta(): User
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'sanctum');

        return $marta;
    }
}
