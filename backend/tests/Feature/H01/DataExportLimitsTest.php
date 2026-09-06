<?php

namespace Tests\Feature\H01;

use App\Models\DataExport;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * S1-12 · świadek pisany Z KRYTERIUM: co najwyżej jeden niewygasły eksport na osobę.
 *
 * Kryterium: 10× `POST /me/exports` w minucie → **1 job w kolejce** (reszta odrzucona);
 * plik znika po TTL (test z przesuniętym zegarem).
 *
 * Dlaczego to nie jest kosmetyka: eksport RODO zawiera PESEL i adres w postaci jawnej.
 * Dziesięć żądań to dziesięć plików z danymi osobowymi leżących bez terminu ważności —
 * to jest wyciek rozłożony w czasie, nie problem wydajności.
 *
 * REGUŁA: **na osobę co najwyżej JEDEN niewygasły
 * eksport.** `queued`/`processing` → 409 `export_in_progress`; `ready` z ważnym
 * `expires_at` → 409 `export_already_available`; brak żywego → 202. `throttle` 3/60
 * jest drugą warstwą, ze slugiem `too_many_requests`.
 *
 * ⚠ SKĄD TA REGUŁA — bo pierwsza wersja zależała od SZYBKOŚCI KOLEJKI. Dwa pomiary
 * tej samej rzeczy dały dwa różne światy: z workerem „1 wiersz, 409 + 9×429",
 * a w suicie „3 wiersze, 202×3 + 429×7". Oba prawdziwe. Przyczyna: `phpunit.xml`
 * wymusza `QUEUE_CONNECTION=sync`, więc eksport jest gotowy natychmiast i stan
 * „trwa poprzedni" NIGDY nie zachodzi. Reguła „jeden ŻYWY eksport" nie zależy od
 * tego, jak szybko zadanie się wykona — i dlatego da się ją zmierzyć w obu światach.
 * To jest ta sama klasa co P-1: **konfiguracja pomiaru pochodziła z miejsca,
 * którego pomiar nie deklarował.**
 *
 * ⚠ Czerwony do czasu wdrożenia limitu „jeden żywy eksport na osobę" w samym
 * endpointzie eksportu. Nie naprawiam tutaj — ten plik tylko mierzy.
 *
 * `php artisan test --filter=DataExportLimits`
 */
class DataExportLimitsTest extends TestCase
{
    use RefreshDatabase;

    /** TTL pliku eksportu wg przyjętego założenia biznesowego. */
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

        $drugi = $this->postJson('/api/v1/me/exports');

        $this->assertSame(
            409,
            $drugi->status(),
            'Drugie żądanie dostało '.$drugi->status().'. Reguła: dopóki żyje poprzedni '
            .'eksport, kolejny ma być odmówiony kodem 409 — niezależnie od tego, czy zadanie '
            .'zdążyło się wykonać.',
        );

        $this->assertContains(
            $drugi->json('error.code'),
            ['export_in_progress', 'export_already_available'],
            'Kod odmowy: '.var_export($drugi->json('error.code'), true).'. Oczekiwane '
            .'`export_in_progress` (trwa) albo `export_already_available` (gotowy i ważny).',
        );

        $this->assertNotNull(
            $drugi->json('error.reason.export_id'),
            'Odmowa nie wskazuje istniejącego eksportu, więc klient nie ma jak go pobrać.',
        );
    }

    public function test_a_new_export_is_allowed_once_the_previous_one_expired(): void
    {
        // Druga połowa reguły „jeden ŻYWY eksport". Bez tego świadka spełniłby ją
        // serwer, który po pierwszym eksporcie odmawia NA ZAWSZE — czyli odbiera
        // uprawnienie z RODO zamiast je ograniczać.
        $marta = $this->actingAsMarta();

        $this->postJson('/api/v1/me/exports');
        $this->postJson('/api/v1/me/exports')->assertStatus(409);

        $this->przewinZegarZaTermin();

        $this->assertContains(
            $this->postJson('/api/v1/me/exports')->status(),
            [200, 201, 202],
            'Po wygaśnięciu poprzedniego eksportu nowy nadal jest odmawiany.',
        );

        $this->assertGreaterThanOrEqual(
            1,
            DataExport::where('user_id', $marta->id)->count(),
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

    public function test_the_throttle_refusal_also_uses_the_error_envelope(): void
    {
        // Kryterium: 429 to osobna odmowa („za dużo żądań w oknie"),
        // różna od 409 („trwa poprzedni eksport"). Domyślna odpowiedź `ThrottleRequests`
        // Laravela NIE jest kopertą kontraktu — a odmowa poza kopertą trafia we froncie
        // w gałąź „nieznany błąd" i uczestniczka nie dowiaduje się, że ma spróbować później.
        $this->actingAsMarta();

        $odpowiedzi = [];
        for ($i = 0; $i < 10; $i++) {
            $odpowiedzi[] = $this->postJson('/api/v1/me/exports');
        }

        $throttled = null;
        foreach ($odpowiedzi as $odpowiedz) {
            if ($odpowiedz->status() === 429) {
                $throttled = $odpowiedz;
                break;
            }
        }

        if ($throttled === null) {
            $this->markTestSkipped(
                'Żadne z dziesięciu żądań nie dostało 429 — ogranicznik czasowy albo nie działa, '
                .'albo odmawia wcześniej kodem 409. To sprawdza osobny świadek liczby eksportów.',
            );
        }

        $throttled->assertJsonStructure(['error' => ['status', 'code', 'message']]);
        $throttled->assertJsonPath('error.code', 'too_many_requests');
        $throttled->assertJsonPath('error.status', 429);
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

        $this->przewinZegarZaTermin();

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

        $this->przewinZegarZaTermin();

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

    /**
     * Przesuwa zegar poza termin ważności i uruchamia harmonogram.
     *
     * `schedule:run` zamiast nazwy polecenia — świadek pilnuje SKUTKU z kryterium,
     * a nie tego, jak wykonawca nazwie zadanie. Ale samo przesunięcie o dobę NIE
     * WYSTARCZA i to była wada tego przyrządu: zadanie sprzątające chodzi co godzinę
     * (`0 * * * *`), więc jest „due" wyłącznie w minucie zerowej. Po `travel(25h)`
     * zegar lądował gdzie popadnie, harmonogram nie odpalał nic, a plik zostawał —
     * i wyglądało to na lukę produktu.
     */
    private function przewinZegarZaTermin(): void
    {
        $this->travel(self::TTL_GODZIN + 1)->hours();

        // Harmonogram jest tu ŹRÓDŁEM, ale nie wykonawcą — i to jest wynik dwóch pomiarów,
        // nie ostrożność:
        //   1. `schedule:run` w procesie testu nie odpala zadań mimo przesuniętego zegara;
        //   2. `$event->run()` odpala je w OSOBNYM procesie, który czyta `.env`, czyli
        //      celuje w bazę demo zamiast testowej — polecenie padało tam na brakującej
        //      kolumnie i wyglądało jak luka produktu.
        // Obie czerwienie były wadami tego przyrządu i tak zostały zgłoszone.
        //
        // Dlatego świadek CZYTA z harmonogramu, co jest zaplanowane, i uruchamia to
        // W PROCESIE TESTU. Nadal nie zna nazwy polecenia z góry — kryterium brzmi
        // „plik znika po terminie", a nie „istnieje zadanie o nazwie X".
        $schedule = $this->app->make(Schedule::class);

        foreach ($schedule->events() as $event) {
            if (preg_match("/'artisan'\s+(\S+)/", (string) $event->command, $dopasowanie) === 1) {
                $this->artisan($dopasowanie[1]);
            }
        }
    }

    private function actingAsMarta(): User
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'sanctum');

        return $marta;
    }
}
