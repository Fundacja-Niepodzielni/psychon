<?php

namespace Tests\Feature\H13;

use App\Jobs\GenerateCertificate;
use App\Models\Certificate;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\LessonProgress;
use App\Models\Notification;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\RequiresProcessConcurrency;
use Tests\TestCase;

/**
 * S1-5 · świadek numeracji certyfikatów pisany Z KRYTERIUM:
 * „≥20 równoczesnych → ciąg bez dziur i bez duplikatów".
 *
 * DLACZEGO ISTNIEJE OBOK `ConcurrentCertificateTest`. Tamten plik nazywa się
 * „Concurrent", ale mierzy inny świat — zmierzone lekturą:
 *   (1) generuje SEKWENCYJNIE (`$graduates->each(dispatchSync)`) w JEDNYM procesie,
 *       więc nie ma dwóch transakcji, które mogłyby się ścigać;
 *   (2) startuje w edycji, w której `ola` ma już `NP/2026/001`, więc
 *       `SELECT … FOR UPDATE` ma co zablokować.
 *
 * Luka, o którą tu chodzi, żyje dokładnie POZA tymi dwoma założeniami.
 * `Certificate::where('edition_id', …)->lockForUpdate()->get()` na zbiorze PUSTYM
 * nie blokuje ŻADNEGO wiersza — w PostgreSQL blokada wierszowa bez wierszy nie
 * istnieje i nie powstrzymuje wstawienia. Przy PIERWSZYM wydaniu w edycji
 * równoległe transakcje mogą więc policzyć ten sam numer. Unikalny indeks
 * `certificates.number` (migracja `…000070…:18`, JUŻ obecny) zamienia to nie
 * w duplikat, lecz w WYJĄTEK — czyli w DZIURĘ: uczestniczka zostaje bez certyfikatu.
 *
 * Celowo BEZ `RefreshDatabase`: ta cecha owija test w otwartą transakcję, której
 * osobne procesy (własne połączenia) nigdy nie zobaczą jako zatwierdzonej.
 * Prawdziwa współbieżność potrzebuje prawdziwych commitów — dlatego dane są tu
 * zakładane i sprzątane ręcznie (ten sam wzorzec co `H14\ConcurrentDocumentNumberTest`).
 *
 * `php artisan test --filter=EmptyEditionConcurrentCertificate`
 */
class EmptyEditionConcurrentCertificateTest extends TestCase
{
    use RequiresProcessConcurrency;

    private const CONCURRENCY = 20;

    private Edition $edition;

    /** @var list<int> */
    private array $userIds = [];

    /**
     * Czy TEN test zaseedował bazę demo.
     *
     * Świadek bez `RefreshDatabase` zapisuje NAPRAWDĘ — więc wszystko, co zawoła,
     * zostaje po nim dla następnych testów. Pierwsza wersja sprzątała własne 20 kont
     * i własną edycję, ale nie seed demo, który sama wywołała. Skutek zmierzyła obca
     * sesja na swoim czubku: 9 czerwonych w H14, H18, H21 i Notifications, bo testy
     * zakładające pustą bazę zastawały sześć kont demo. Zielony w izolacji, trucizna
     * w suicie — najgorszy możliwy kształt wady w przyrządzie.
     */
    private bool $seededDemo = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->requireProcessConcurrency();

        // Ten świadek nie używa `RefreshDatabase` (patrz nagłówek), więc zastaje bazę
        // w stanie, w jakim zostawił ją poprzedni test — a `RefreshDatabase` zostawia
        // ją ZMIGROWANĄ I PUSTĄ. Seed jest tu warunkowy, żeby uruchomienie w izolacji
        // i uruchomienie w pełnej suicie dawały ten sam stan wyjściowy.
        if (! Schema::hasTable('users')) {
            $this->artisan('migrate');
        }

        if (User::where('email', 'ola@demo.pl')->doesntExist()) {
            $this->seed();
            $this->seededDemo = true;
        }

        // Nowa edycja z wyższym `id` wygrywa `Settings::activeEdition()`
        // (`where status = active` + `orderByDesc('id')`), więc nie trzeba ruszać
        // edycji seedowej ani kasować certyfikatu `oli`.
        $this->edition = Edition::create([
            'name' => 'Edycja pusta — świadek numeracji',
            'starts_at' => '2027-10-01',
            'ends_at' => '2028-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);

        for ($i = 0; $i < self::CONCURRENCY; $i++) {
            $this->userIds[] = $this->makeEligibleVolunteerInEdition()->id;
        }
    }

    protected function tearDown(): void
    {
        $ids = $this->userIds;
        $slotIds = SupervisionSignup::whereIn('user_id', $ids)->pluck('slot_id');

        Certificate::whereIn('user_id', $ids)->delete();
        Notification::whereIn('user_id', $ids)->delete();
        SupervisionSignup::whereIn('user_id', $ids)->delete();
        SupervisionSlot::whereIn('id', $slotIds)->delete();
        InternshipEntry::whereIn('user_id', $ids)->delete();
        LessonProgress::whereIn('user_id', $ids)->delete();
        TestAttempt::whereIn('user_id', $ids)->delete();
        WorkshopCompletion::whereIn('user_id', $ids)->delete();
        User::whereIn('id', $ids)->forceDelete();

        if (isset($this->edition)) {
            Edition::whereKey($this->edition->id)->delete();
        }

        // Stan wyjściowy sprząta się PRZED pomiarem (§8.4) — ale test, który zapisuje
        // poza transakcją, musi też sprzątnąć PO sobie, i to do stanu ZASTANEGO.
        // `RefreshDatabase` zostawia bazę zmigrowaną i pustą; skoro to my ją zaseedowaliśmy,
        // to my mamy ją opróżnić, a nie następny test ma się z tym zmierzyć.
        if ($this->seededDemo) {
            // Kasujemy REKORDY, nie schemat. `migrate:fresh` w środku suity zdejmuje
            // tabele spod nóg testom, które akurat trzymają połączenie — przyrząd,
            // który sprząta przez zburzenie budynku, jest gorszy od bałaganu.
            $this->wipeSeededRows();
        }

        // Kontrola własnego sprzątania. Bez niej „posprzątane" jest deklaracją:
        // to dokładnie ten rodzaj cichej pozostałości, który raz już kosztował
        // obcą sesję 9 czerwonych testów bez związku z jej zmianami.
        $pozostalo = User::count();

        parent::tearDown();

        if ($this->seededDemo && $pozostalo !== 0) {
            throw new \RuntimeException(
                'Świadek zostawił po sobie '.$pozostalo.' kont w bazie testowej. '
                .'Następne testy zastaną niepustą bazę i zaczerwienią się bez własnej winy.',
            );
        }
    }

    public function test_twenty_concurrent_generations_in_an_empty_edition_leave_no_gap(): void
    {
        $this->assertSame(
            0,
            Certificate::where('edition_id', $this->edition->id)->count(),
            'Punkt wyjścia świadka: edycja MUSI być pusta, inaczej mierzy inny scenariusz.',
        );

        $this->zmierzWyscig(0);
    }

    public function test_concurrent_generations_in_a_non_empty_edition_leave_no_gap(): void
    {
        // Drugi scenariusz tej samej klasy — dopisany po sprostowaniu z H10.
        // Tam okazało się, że `SELECT … FOR UPDATE` nie broni przed fantomami,
        // więc wyścig przegrywa TAKŻE przy zbiorze niepustym. Świadek mierzący
        // wyłącznie edycję pustą nie dowodziłby domknięcia klasy (§8.2) —
        // dowodziłby tylko, że najłatwiejszy przypadek został załatany.
        GenerateCertificate::dispatchSync(array_shift($this->userIds));

        $this->assertSame(
            1,
            Certificate::where('edition_id', $this->edition->id)->count(),
            'Punkt wyjścia: dokładnie jeden certyfikat, żeby blokada miała co blokować.',
        );

        $this->zmierzWyscig(1);
    }

    /**
     * Uruchamia równoczesne generowanie dla wszystkich pozostałych uczestniczek
     * i sprawdza, że numeracja jest ciągła od 1.
     *
     * @param  int  $juzWydane  ile certyfikatów istniało przed wyścigiem
     */
    private function zmierzWyscig(int $juzWydane): void
    {

        $directory = sys_get_temp_dir().'/h13-pusta-edycja-'.uniqid('', true);
        mkdir($directory);
        $go = $directory.'/go';
        $children = [];

        foreach ($this->userIds as $userId) {
            $pid = pcntl_fork();

            if ($pid === -1) {
                $this->fail('Nie udało się uruchomić procesu testu współbieżności.');
            }

            if ($pid === 0) {
                DB::purge(); // własne połączenie w procesie potomnym
                file_put_contents($directory.'/ready-'.$userId, 'ready');

                while (! file_exists($go)) {
                    usleep(1000);
                }

                try {
                    GenerateCertificate::dispatchSync($userId);
                    file_put_contents($directory.'/result-'.$userId, 'ok');
                } catch (\Throwable $exception) {
                    file_put_contents($directory.'/result-'.$userId, 'blad: '.$exception->getMessage());
                }

                exit(0);
            }

            $children[] = $pid;
        }

        // Bariera: nikt nie rusza, dopóki wszyscy nie stoją na starcie. Bez niej
        // procesy startują kolejno i świadek znów mierzyłby sekwencję zamiast wyścigu.
        for ($attempt = 0; $attempt < 20000; $attempt++) {
            if (count(glob($directory.'/ready-*')) === count($this->userIds)) {
                break;
            }
            usleep(1000);
        }

        $this->assertCount(
            count($this->userIds),
            glob($directory.'/ready-*'),
            'Nie wszystkie procesy doszły do bariery — pomiar nie był współbieżny.',
        );

        file_put_contents($go, 'go');

        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
        }

        $results = array_map(
            static fn (string $path): string => trim((string) file_get_contents($path)),
            glob($directory.'/result-*'),
        );

        foreach (glob($directory.'/*') as $file) {
            @unlink($file);
        }
        @rmdir($directory);

        $oczekiwane = $juzWydane + count($this->userIds);

        $numbers = Certificate::where('edition_id', $this->edition->id)
            ->orderBy('id')
            ->pluck('number')
            ->all();

        $bledy = array_values(array_filter($results, static fn (string $r): bool => $r !== 'ok'));

        // Komunikat celowo ZWIĘZŁY: pełne treści wyjątków SQL potrafią zająć ekran
        // i zasłonić jedyną liczbę, która ma tu znaczenie — ile uczestniczek zostało
        // bez certyfikatu.
        $klasy = [];
        foreach ($bledy as $blad) {
            $klasy[] = str_contains($blad, '23505') ? 'unikat numeru (23505)' : mb_substr($blad, 0, 60);
        }

        $this->assertSame(
            [],
            $bledy,
            sprintf(
                'Z %d równoczesnych generowań UDAŁO SIĘ %d, poległo %d. Przyczyny: %s. '
                .'Każdy poległy proces = uczestniczka bez certyfikatu, czyli DZIURA w numeracji. '
                .'Numery zapisane w bazie: %s',
                count($results),
                count($results) - count($bledy),
                count($bledy),
                implode(', ', array_unique($klasy)),
                implode(', ', $numbers) ?: '(brak)',
            ),
        );

        $this->assertCount(
            $oczekiwane,
            $numbers,
            'Wydano '.count($numbers).' certyfikatów zamiast '.$oczekiwane.' — to jest dziura w numeracji.',
        );

        $this->assertCount(
            $oczekiwane,
            array_unique($numbers),
            'Numery certyfikatów zduplikowane pod obciążeniem: '.implode(', ', $numbers),
        );

        $sequences = array_map(
            static fn (string $number): int => (int) substr($number, strrpos($number, '/') + 1),
            $numbers,
        );
        sort($sequences);

        $this->assertSame(
            range(1, $oczekiwane),
            $sequences,
            'Ciąg numeracji ma dziurę: '.implode(', ', $sequences),
        );
    }

    /**
     * Usuwa dane, które wprowadził seed — bez ruszania schematu.
     *
     * Kolejność jest odwrotna do zależności: najpierw to, co wskazuje na użytkowników
     * i edycje, na końcu one same. `TRUNCATE … CASCADE` jednym poleceniem jest tu
     * właściwsze niż kaskada modeli, bo nie zależy od tego, czy ktoś pamiętał
     * o `onDelete` w migracji.
     */
    private function wipeSeededRows(): void
    {
        $tabele = DB::select(
            "select tablename from pg_tables where schemaname = 'public' and tablename <> 'migrations'"
        );

        $nazwy = array_map(static fn (object $t): string => '"'.$t->tablename.'"', $tabele);

        if ($nazwy !== []) {
            DB::statement('truncate table '.implode(', ', $nazwy).' restart identity cascade');
        }
    }

    /** Uczestniczka z kompletem czterech warunków, osadzona w PUSTEJ edycji tego świadka. */
    private function makeEligibleVolunteerInEdition(): User
    {
        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();
        $joanna = User::where('email', 'joanna@demo.pl')->firstOrFail();

        $grad = User::factory()->create([
            'role' => 'volunteer',
            'edition_id' => $this->edition->id,
            'program_completed_at' => null,
            'access_expires_at' => now()->addMonths(3),
        ]);

        foreach (LessonProgress::where('user_id', $ola->id)->get() as $progress) {
            LessonProgress::create([
                'user_id' => $grad->id,
                'lesson_id' => $progress->lesson_id,
                'watched_seconds' => $progress->watched_seconds,
                'active_seconds' => $progress->active_seconds,
                'open_count' => $progress->open_count,
                'last_activity_at' => $progress->last_activity_at,
                'is_completed' => true,
                'completed_at' => now()->subDays(10),
            ]);
        }

        foreach (TestAttempt::where('user_id', $ola->id)->get() as $attempt) {
            TestAttempt::create([
                'user_id' => $grad->id,
                'test_id' => $attempt->test_id,
                'attempt_number' => 1,
                'answers' => $attempt->answers,
                'questions_snapshot' => $attempt->questions_snapshot,
                'score_percent' => $attempt->score_percent,
                'passed' => true,
            ]);
        }

        InternshipEntry::create([
            'user_id' => $grad->id,
            'date' => now()->subDays(20)->toDateString(),
            'hours' => '72.0',
            'form' => 'phone_duty',
            'consultations_count' => 60,
            'description' => 'Staż — bez danych osób konsultowanych.',
            'status' => 'accepted',
            'decided_by' => $joanna->id,
            'decided_at' => now()->subDays(18),
        ]);

        foreach (range(1, 6) as $n) {
            $slot = SupervisionSlot::create([
                'supervisor_id' => $joanna->id,
                'starts_at' => now()->subWeeks($n * 2),
                'duration_minutes' => 90,
                'seats_limit' => 3,
            ]);

            SupervisionSignup::create([
                'slot_id' => $slot->id,
                'user_id' => $grad->id,
                'signed_up_at' => $slot->starts_at->copy()->subDays(5),
                'attendance' => 'present',
                'attendance_marked_by' => $joanna->id,
            ]);
        }

        WorkshopCompletion::create([
            'user_id' => $grad->id,
            'edition_id' => $this->edition->id,
            'completed_at' => now()->subMonth(),
        ]);

        return $grad->fresh();
    }
}
