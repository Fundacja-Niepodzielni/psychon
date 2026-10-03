<?php

namespace Tests\Feature\Cutover;

use App\Models\User;
use App\Services\Cutover\ProbeDataPurge;
use App\Services\Cutover\PurgeRefused;
use App\Support\ProductionStart;
use App\Support\RestoreTrial;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * `php artisan psychon:zero-danych-probnych` na ziarnie demo (baza testowa).
 *
 * Konta z listy: super_admin, project_manager i instructor z ziarna. Osoby
 * probne: trzy konta uczestnikow z ziarna i jedno dodatkowe konto personelu,
 * ktorego NIE ma na liscie - personel spoza listy tez jest osoba probna.
 *
 * Tabele tresci programu sa wymienione w tym pliku wprost, a nie brane z klasy
 * polecenia: przeniesienie tabeli tresci do usuwanych w klasie ma zapalic te
 * proby, a nie przesunac razem z nia to, co proby sprawdzaja.
 */
class ZeroDanychProbnychCommandTest extends TestCase
{
    use RefreshDatabase;

    private const array CONTENT_TABLES = [
        'editions',
        'settings',
        'courses',
        'course_topics',
        'lessons',
        'materials',
        'tests',
        'test_questions',
        'test_answers',
        'legal_document_versions',
        'document_templates',
        'document_template_versions',
        'internship_forms',
    ];

    private const array TRACE_TABLES = [
        'lesson_progress',
        'test_attempts',
        'workshop_completions',
        'internship_entries',
        'supervisor_assignments',
        'supervision_slots',
        'supervision_signups',
        'certificates',
        'documents',
        'psychologist_profiles',
        'profile_documents',
        'notifications',
        'emails',
        'instructor_questions',
        'data_exports',
        'help_messages',
        'applications',
        'access_date_changes',
    ];

    /** Wynik udanego odtworzenia probnego (ksztalt z deploy/prod/odtworzenie-probne.sh). */
    private const string RESTORE_OK = "odtworzenie: tabela users = 7 wierszy (zgodne)\nodtworzenie: tabela courses = 11 wierszy (zgodne)\nodtworzenie probne: OK, wszystkie liczby wierszy zgodne\n";

    /** @var list<int> */
    private array $keepIds = [];

    /** @var list<string> */
    private array $probeFiles = [];

    private string $keepFile = '';

    /** @var list<string> */
    private array $ownFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->seed();

        $admin = User::query()->where('role', 'super_admin')->firstOrFail();
        $manager = User::query()->where('role', 'project_manager')->firstOrFail();
        $instructor = User::query()->where('role', 'instructor')->firstOrFail();
        $admin->forceFill(['keycloak_sub' => (string) Str::uuid()])->save();

        // Konto personelu spoza listy - osoba probna mimo roli personelu.
        User::factory()->create(['role' => 'project_manager', 'first_name' => 'Personel', 'last_name' => 'Probny']);

        $this->keepIds = [$admin->id, $manager->id, $instructor->id];
        $this->keepFile = $this->writeKeepFile("# konta personelu\n{$admin->id}\n{$manager->id}\n\n{$instructor->id}\n");

        $this->seedProbeTraces($admin);

        // Krok 3 procedury: wynik udanego odtworzenia probnego zapisuje znacznik (wlasciwa sciezka polecenia).
        [$code, $output] = $this->runCommand(['--zapisz-odtworzenie' => $this->writeRestoreResult(self::RESTORE_OK)]);
        $this->assertSame(0, $code, $output);
    }

    protected function tearDown(): void
    {
        foreach ($this->ownFiles as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }

        parent::tearDown();
    }

    public function test_dry_run_reports_counts_and_changes_nothing(): void
    {
        $before = $this->snapshot();

        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile]);

        $this->assertSame(0, $code, $output);
        $this->assertStringContainsString('BIEG NA SUCHO', $output);
        $plan = $this->parseTables($output, 'usunac');

        $this->assertSame(4, $plan['users']['delete']);
        foreach (['lesson_progress', 'test_attempts', 'internship_entries', 'applications', 'notifications', 'emails', 'certificates', 'documents', 'consents', 'audit_log'] as $table) {
            $this->assertGreaterThan(0, $plan[$table]['delete'], "{$table}: bieg na sucho ma pokazac wiersze do usuniecia");
        }
        foreach (self::CONTENT_TABLES as $table) {
            $this->assertSame(0, $plan[$table]['delete'], "{$table}: tresc programu nie jest planowana do usuniecia");
        }
        $this->assertMatchesRegularExpression('/^PLIKI wskazane=5 istniejace=5 /m', $output);
        $this->assertMatchesRegularExpression('/^WYNIK BIEG_NA_SUCHO usunac_kont=4 /m', $output);

        $this->assertSame($before, $this->snapshot(), 'bieg na sucho niczego nie zmienia');
        foreach ($this->probeFiles as $path) {
            Storage::disk('local')->assertExists($path);
        }
    }

    public function test_real_run_leaves_zero_probe_people_and_keeps_staff_and_content(): void
    {
        $before = $this->snapshot();
        $keptAccounts = DB::table('users')->whereIn('id', $this->keepIds)->orderBy('id')->get(['id', 'email', 'role'])->map(static fn (object $row): array => (array) $row)->all();
        $materialFiles = DB::table('materials')->pluck('file_path')->all();
        $this->assertNotEmpty($materialFiles);

        [, $dryOutput] = $this->runCommand(['--zachowaj' => $this->keepFile]);
        $plan = $this->parseTables($dryOutput, 'usunac');

        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);

        $this->assertSame(0, $code, $output);
        $this->assertMatchesRegularExpression('/^WYNIK BIEG_WLASCIWY usunieto_kont=4 osob_spoza_listy_po=0$/m', $output);
        $this->assertMatchesRegularExpression('/^PLIKI wskazane=5 usunieto=5 brak_na_dysku=0 bledow=0$/m', $output);

        // Zero osob probnych: zostaja dokladnie konta z listy, nietkniete.
        $this->assertSame($keptAccounts, DB::table('users')->orderBy('id')->get(['id', 'email', 'role'])->map(static fn (object $row): array => (array) $row)->all());

        foreach (self::TRACE_TABLES as $table) {
            $this->assertSame(0, DB::table($table)->count(), "{$table}: slady osob probnych maja zniknac");
        }
        $this->assertSame(0, DB::table('sensitive_access_log')->count(), 'dziennik wgladu z fazy testowej znika');
        $this->assertSame(1, DB::table('audit_log')->count(), 'dziennik zdarzen z fazy testowej znika; zostaje jeden wpis o czyszczeniu');
        $this->assertSame('trial_data.purged', DB::table('audit_log')->value('action'));
        $this->assertMatchesRegularExpression('/^ZNACZNIK start_produkcji=zapisany$/m', $output);
        $this->assertMatchesRegularExpression('/^DZIENNIK pierwszy_wpis=trial_data\.purged$/m', $output);
        $this->assertSame(0, DB::table('keycloak_sessions')->whereNotIn('sub', DB::table('users')->whereNotNull('keycloak_sub')->select('keycloak_sub'))->count());
        $this->assertSame(1, DB::table('keycloak_sessions')->count(), 'sesja konta z listy zostaje');
        $this->assertSame(0, DB::table('consents')->whereNotIn('user_id', $this->keepIds)->count());

        // Tresc programu nietknieta.
        foreach (self::CONTENT_TABLES as $table) {
            // `settings` rosnie o jeden wiersz: znacznik startu produkcji.
            $expected = $table === 'settings' ? $before[$table] + 1 : $before[$table];
            $this->assertSame($expected, DB::table($table)->count(), "{$table}: tresc programu zostaje");
        }
        $this->assertSame(1, DB::table('settings')->where('key', 'production_started_at')->count());
        $this->assertSame(11, DB::table('courses')->count());
        $this->assertSame(30, DB::table('test_questions')->count());
        $this->assertSame(120, DB::table('test_answers')->count());
        $this->assertSame(3, DB::table('course_assignments')->count(), 'przypisania prowadzacego z listy zostaja');
        $this->assertSame(1, DB::table('instructor_profiles')->count());

        // Liczby po biegu = liczby "po" z biegu na sucho, tabela po tabeli.
        foreach ($plan as $table => $row) {
            // Dwa wiersze dopisane na koncu biegu: wpis o czyszczeniu i znacznik startu.
            $expected = match ($table) {
                'audit_log', 'settings' => $row['after'] + 1,
                default => $row['after'],
            };
            $this->assertSame($expected, DB::table($table)->count(), "{$table}: wynik rozny od planu biegu na sucho");
        }

        foreach ($this->probeFiles as $path) {
            Storage::disk('local')->assertMissing($path);
        }
        foreach ($materialFiles as $path) {
            Storage::disk('local')->assertExists($path);
        }
    }

    public function test_every_run_after_the_first_is_refused_and_changes_nothing(): void
    {
        [$code, $first] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);
        $this->assertSame(0, $code, $first);
        $afterFirst = $this->snapshot();
        $marker = ProductionStart::recordedAt();
        $this->assertNotNull($marker);

        $runs = [
            'bieg na sucho' => ['--zachowaj' => $this->keepFile],
            'bieg wlasciwy, to samo potwierdzenie' => ['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4'],
            'bieg wlasciwy, potwierdzenie 0' => ['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '0'],
            'bez listy' => ['--wykonaj' => true, '--potwierdz' => '0'],
        ];

        foreach ($runs as $name => $options) {
            [$code, $output] = $this->runCommand($options);

            $this->assertSame(2, $code, "{$name}: {$output}");
            $this->assertStringContainsString('ODMOWA: Przejscie zostalo juz wykonane', $output, $name);
            $this->assertStringNotContainsString('TABELA', $output, "{$name}: odmowa nie pokazuje planu");
            $this->assertSame($afterFirst, $this->snapshot(), "{$name}: baza bez zmian");
            $this->assertSame($marker, ProductionStart::recordedAt(), "{$name}: znacznik bez zmian");
        }

        $this->assertSame(1, DB::table('audit_log')->where('action', 'trial_data.purged')->count(), 'jeden wpis o czyszczeniu');
    }

    public function test_the_purge_entry_carries_counters_and_codes_only(): void
    {
        [, $dry] = $this->runCommand(['--zachowaj' => $this->keepFile]);
        $plan = $this->parseTables($dry, 'usunac');
        $journalRowsBefore = DB::table('audit_log')->count();
        $this->assertGreaterThan(0, $journalRowsBefore);

        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);
        $this->assertSame(0, $code, $output);

        $entry = DB::table('audit_log')->first();
        $this->assertNotNull($entry);
        $this->assertSame('trial_data.purged', $entry->action);
        $this->assertNull($entry->actor_id, 'zrodlem uruchomienia jest konsola, nie osoba');
        $this->assertNull($entry->subject_type);
        $this->assertNull($entry->subject_id);

        $details = json_decode((string) $entry->details, true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(['deleted', 'executor', 'kept_accounts'], $this->sortedKeys($details));
        $this->assertSame('console', $details['executor']);
        $this->assertSame(3, $details['kept_accounts']);

        // Kazda tabela usuwana ma licznik (takze zerowy), rowny liczbie z biegu na sucho; nic poza licznikami.
        $this->assertSame(array_keys(array_intersect_key($plan, ProbeDataPurge::PURGE)), array_keys($details['deleted']));
        foreach ($details['deleted'] as $table => $count) {
            $this->assertIsInt($count, $table);
            $this->assertSame($plan[$table]['delete'], $count, "{$table}: licznik we wpisie rozny od biegu na sucho");
        }
        $this->assertSame($journalRowsBefore, $details['deleted']['audit_log']);
        $this->assertSame(1, $details['deleted']['sensitive_access_log']);
        $this->assertSame(4, $details['deleted']['users']);

        // Zadnej wartosci osoby we wpisie.
        $encoded = (string) $entry->details;
        $this->assertStringNotContainsString('@', $encoded);
        foreach (['Demo', 'Probny', 'Marta'] as $needle) {
            $this->assertStringNotContainsString($needle, $encoded);
        }

        // Znacznik niesie chwile wpisu.
        $this->assertSame(
            Carbon::parse($entry->created_at)->utc()->format('Y-m-d\TH:i:s\Z'),
            ProductionStart::recordedAt(),
        );
    }

    public function test_the_purge_entry_carries_no_identifiers_and_no_addresses_at_any_depth(): void
    {
        // Wszystko, co wskazuje osobe: identyfikatory kont, adresy e-mail i nazwiska sprzed biegu.
        $people = DB::table('users')->get(['id', 'email', 'first_name', 'last_name']);
        $this->assertGreaterThan(3, $people->count());
        $ids = $people->pluck('id')->map(static fn (mixed $id): string => (string) $id)->all();
        $needles = $people->pluck('email')->merge($people->pluck('first_name'))->merge($people->pluck('last_name'))->filter()->unique()->values()->all();

        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);
        $this->assertSame(0, $code, $output);

        $entry = DB::table('audit_log')->where('action', 'trial_data.purged')->first();
        $this->assertNotNull($entry);
        $details = json_decode((string) $entry->details, true, flags: JSON_THROW_ON_ERROR);
        $this->assertIsArray($details);

        // Ksztalt: dwa liczniki i kod zrodla uruchomienia. Liczba kont zostajacych jest liczba, nie lista.
        $this->assertSame(['deleted', 'executor', 'kept_accounts'], $this->sortedKeys($details));
        $this->assertIsInt($details['kept_accounts'], 'kept_accounts to liczba, nie lista identyfikatorow');
        $this->assertSame('console', $details['executor']);
        $this->assertIsArray($details['deleted']);
        foreach ($details['deleted'] as $table => $count) {
            $this->assertIsString($table, 'klucz w deleted to nazwa tabeli, nie identyfikator');
            $this->assertArrayHasKey($table, ProbeDataPurge::PURGE, "{$table}: nieznana tabela w deleted");
            $this->assertIsInt($count, "{$table}: licznik jest liczba, nie lista");
        }

        // Przeglad rekurencyjny: kazdy lisc to liczba albo kod zrodla; kazdy klucz to nazwa pola albo tabeli.
        $leaves = [];
        $keys = [];
        array_walk_recursive($details, static function (mixed $value, mixed $key) use (&$leaves, &$keys): void {
            $leaves[] = $value;
            $keys[] = $key;
        });
        foreach ($leaves as $leaf) {
            $this->assertTrue(is_int($leaf) || $leaf === 'console', 'lisc ladunku poza licznikiem i kodem zrodla');
        }
        foreach ($keys as $key) {
            $this->assertIsString($key, 'w ladunku nie ma list ani kluczy liczbowych (identyfikatorow)');
            $this->assertNotContains($key, $ids);
        }

        // Zadnego adresu e-mail ani wartosci osoby, w zadnym miejscu zapisu.
        $encoded = (string) $entry->details;
        $this->assertDoesNotMatchRegularExpression('/[^\s"@]+@[^\s"@]+/', $encoded);
        foreach ($needles as $needle) {
            $this->assertStringNotContainsString((string) $needle, $encoded);
        }
    }

    public function test_the_confirmation_without_the_execute_flag_still_runs_dry(): void
    {
        $before = $this->snapshot();

        // Poprawna liczba w --potwierdz, ale bez --wykonaj: nadal bieg na sucho, nic nie znika.
        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile, '--potwierdz' => '4']);

        $this->assertSame(0, $code, $output);
        $this->assertStringContainsString('BIEG NA SUCHO', $output);
        $this->assertStringNotContainsString('BIEG_WLASCIWY', $output);
        $this->assertMatchesRegularExpression('/^WYNIK BIEG_NA_SUCHO usunac_kont=4 /m', $output);
        $this->assertSame($before, $this->snapshot(), 'samo potwierdzenie nie usuwa niczego');
        $this->assertFalse(ProductionStart::isRecorded());
        foreach ($this->probeFiles as $path) {
            Storage::disk('local')->assertExists($path);
        }
    }

    public function test_without_the_restore_trial_marker_every_run_is_refused_and_changes_nothing(): void
    {
        DB::table('settings')->where('key', RestoreTrial::KEY)->delete();
        $before = $this->snapshot();

        $runs = [
            'bieg na sucho' => ['--zachowaj' => $this->keepFile],
            'bieg wlasciwy' => ['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4'],
        ];

        foreach ($runs as $name => $options) {
            [$code, $output] = $this->runCommand($options);

            $this->assertSame(2, $code, "{$name}: {$output}");
            $this->assertStringContainsString('ODMOWA: Brak potwierdzonego odtworzenia probnego', $output, $name);
            $this->assertStringNotContainsString('TABELA', $output, "{$name}: odmowa nie pokazuje planu");
            $this->assertSame($before, $this->snapshot(), "{$name}: baza bez zmian");
            $this->assertFalse(ProductionStart::isRecorded(), $name);
        }

        // Bramka stoi tez w samej usludze, nie tylko w poleceniu.
        try {
            ProbeDataPurge::execute($this->keepIds, 4);
            $this->fail('Usluga bez znacznika odtworzenia ma odmowic.');
        } catch (PurgeRefused $refused) {
            $this->assertStringContainsString('odtworzenia probnego', $refused->getMessage());
            $this->assertSame($before, $this->snapshot());
        }

        // Po zapisie znacznika ten sam bieg przechodzi.
        $this->runCommand(['--zapisz-odtworzenie' => $this->writeRestoreResult(self::RESTORE_OK)]);
        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);
        $this->assertSame(0, $code, $output);
    }

    public function test_the_restore_trial_marker_is_written_only_from_a_successful_result(): void
    {
        DB::table('settings')->where('key', RestoreTrial::KEY)->delete();
        $before = $this->snapshot();

        $refused = [
            'plik nie istnieje' => sys_get_temp_dir().'/wynik-odtworzenia-nie-istnieje',
            'plik pusty' => $this->writeRestoreResult(''),
            'niezgodnosc, choc ostatnia linia OK' => $this->writeRestoreResult("odtworzenie: NIEZGODNOSC tabela users - oczekiwano 7, po odtworzeniu 6\n".self::RESTORE_OK),
            'sukces nie jest ostatnia linia' => $this->writeRestoreResult(self::RESTORE_OK."odtworzenie: cos jeszcze\n"),
            'inna ostatnia linia' => $this->writeRestoreResult("odtworzenie: tabela users = 7 wierszy (zgodne)\nodtworzenie probne: OK\n"),
            'blad odtworzenia' => $this->writeRestoreResult("odtworzenie: pg_restore zakonczyl sie bledem - kopia jest nieczytelna albo uszkodzona\n"),
        ];

        foreach ($refused as $name => $path) {
            [$code, $output] = $this->runCommand(['--zapisz-odtworzenie' => $path]);

            $this->assertSame(2, $code, "{$name}: {$output}");
            $this->assertStringContainsString('ODMOWA', $output, $name);
            $this->assertStringNotContainsString($path, $output, "{$name}: sciezka nie trafia na wyjscie");
            $this->assertStringNotContainsString('users', $output, "{$name}: tresc pliku nie trafia na wyjscie");
            $this->assertFalse(RestoreTrial::isRecorded(), $name);
            $this->assertSame($before, $this->snapshot(), "{$name}: baza bez zmian");
        }

        [$code, $output] = $this->runCommand(['--zapisz-odtworzenie' => $this->writeRestoreResult(self::RESTORE_OK)]);

        $this->assertSame(0, $code, $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK odtworzenie_probne=zapisany$/m', $output);
        $this->assertTrue(RestoreTrial::isRecorded());
    }

    public function test_the_restore_trial_option_is_standalone_and_closed_after_the_production_start(): void
    {
        DB::table('settings')->where('key', RestoreTrial::KEY)->delete();
        $before = $this->snapshot();
        $ok = $this->writeRestoreResult(self::RESTORE_OK);

        foreach ([['--wykonaj' => true], ['--potwierdz' => '4'], ['--zachowaj' => $this->keepFile], ['--sprawdz' => true]] as $extra) {
            [$code, $output] = $this->runCommand(['--zapisz-odtworzenie' => $ok] + $extra);

            $this->assertSame(2, $code, $output);
            $this->assertStringContainsString('samodzielna opcja', $output);
            $this->assertSame($before, $this->snapshot());
        }

        ProductionStart::record(now());
        $afterStart = $this->snapshot();
        [$code, $output] = $this->runCommand(['--zapisz-odtworzenie' => $ok]);

        $this->assertSame(2, $code, $output);
        $this->assertStringContainsString('Przejscie zostalo juz wykonane', $output);
        $this->assertSame($afterStart, $this->snapshot());
    }

    public function test_a_direct_call_after_the_marker_is_refused_and_changes_nothing(): void
    {
        ProductionStart::record(now());
        $before = $this->snapshot();

        try {
            ProbeDataPurge::execute($this->keepIds, 4);
            $this->fail('Bieg po znaczniku ma odmowic.');
        } catch (PurgeRefused) {
            $this->assertSame($before, $this->snapshot());
        }
    }

    public function test_check_option_measures_without_changing_anything_and_names_every_gap(): void
    {
        $before = $this->snapshot();

        [$code, $output] = $this->runCommand(['--sprawdz' => true]);

        // Przed czyszczeniem pomiar musi byc czerwony: uczestnicy sa, slady sa, znacznika nie ma.
        $this->assertSame(3, $code, $output);
        $this->assertStringContainsString('SPRAWDZENIE PO PRZEJSCIU', $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK start_produkcji=brak$/m', $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK odtworzenie_probne=zapisany$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ uczestnicy=[1-9]\d*$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ slady_osob=[1-9]\d* tabele=\S+/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_audytu wierszy=[1-9]\d* pierwszy=(?!trial_data\.purged)\S+$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_wgladu wierszy=[1-9]\d*$/m', $output);
        // Blokada dziennikow stoi (w tym tescie nikt jej nie otwieral): odmowa trzech operacji, dopisanie przechodzi.
        $this->assertMatchesRegularExpression('/^PROBA_DZIENNIKA usuniecie=odmowa zmiana=odmowa oproznienie=odmowa dopisanie=dziala$/m', $output);
        $this->assertMatchesRegularExpression('/^WYNIK SPRAWDZ NIEZALICZONE$/m', $output);

        $this->assertSame($before, $this->snapshot(), '--sprawdz niczego nie zmienia (proba dziennikow jest wycofywana)');
    }

    public function test_check_option_after_a_real_run_reads_zero_people_and_a_single_journal_entry(): void
    {
        $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);

        // Wynik proby dziennikow nie jest tu sprawdzany: w tescie z RefreshDatabase przelacznik
        // otwarty przez bieg zostaje otwarty do konca testu (granica opisana przy pomocniku blokady dziennikow).
        // Proba na zamknietej blokadzie: ZeroDanychProbnychSprawdzTest.
        [, $output] = $this->runCommand(['--sprawdz' => true]);

        $this->assertMatchesRegularExpression('/^ZNACZNIK start_produkcji=zapisany$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ uczestnicy=0$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ slady_osob=0$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_audytu wierszy=1 pierwszy=trial_data\.purged$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_wgladu wierszy=0$/m', $output);
    }

    public function test_check_option_does_not_combine_with_run_options(): void
    {
        $before = $this->snapshot();

        foreach ([['--wykonaj' => true], ['--potwierdz' => '4'], ['--zachowaj' => $this->keepFile]] as $extra) {
            [$code, $output] = $this->runCommand(['--sprawdz' => true] + $extra);

            $this->assertSame(2, $code, $output);
            $this->assertStringContainsString('ODMOWA', $output);
            $this->assertStringNotContainsString('WYNIK SPRAWDZ', $output);
            $this->assertSame($before, $this->snapshot());
        }
    }

    public function test_refuses_without_a_usable_keep_list(): void
    {
        $before = $this->snapshot();
        $volunteer = User::query()->where('role', 'volunteer')->firstOrFail();
        $managerOnly = User::query()->whereIn('id', $this->keepIds)->where('role', 'project_manager')->firstOrFail();
        $missingId = (int) DB::table('users')->max('id') + 1000;

        $cases = [
            'brak opcji' => [],
            'plik nie istnieje' => ['--zachowaj' => sys_get_temp_dir().'/zachowaj-probny-nie-istnieje'],
            'lista pusta' => ['--zachowaj' => $this->writeKeepFile("# tylko komentarz\n\n")],
            'wiersz nie jest liczba' => ['--zachowaj' => $this->writeKeepFile("{$this->keepIds[0]}\nkonto-probne@example.test\n")],
            'konto uczestnika' => ['--zachowaj' => $this->writeKeepFile("{$this->keepIds[0]}\n{$volunteer->id}\n")],
            'konto nie istnieje' => ['--zachowaj' => $this->writeKeepFile("{$this->keepIds[0]}\n{$missingId}\n")],
            'bez super_admin' => ['--zachowaj' => $this->writeKeepFile("{$managerOnly->id}\n")],
        ];

        // Bieg na sucho i bieg wlasciwy: lista, ktorej nie da sie przyjac, odmawia w obu. Bieg na sucho nie ma
        // drugiej przyczyny odmowy (potwierdzenie), wiec to on dowodzi, ze odmowa pochodzi z samej listy.
        foreach ([[], ['--wykonaj' => true, '--potwierdz' => '4']] as $mode) {
            foreach ($cases as $name => $options) {
                [$code, $output] = $this->runCommand($options + $mode);

                $this->assertSame(2, $code, "{$name}: {$output}");
                $this->assertStringContainsString('ODMOWA', $output, $name);
                $this->assertStringNotContainsString('@', $output, "{$name}: tresc wiersza listy nie trafia na wyjscie");
                $this->assertSame($before, $this->snapshot(), "{$name}: baza bez zmian");
            }
        }
    }

    public function test_refuses_a_real_run_without_matching_confirmation(): void
    {
        $before = $this->snapshot();

        foreach ([[], ['--potwierdz' => '3'], ['--potwierdz' => 'cztery']] as $extra) {
            [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true] + $extra);

            $this->assertSame(2, $code, $output);
            $this->assertStringContainsString('ODMOWA', $output);
            $this->assertSame($before, $this->snapshot());
        }
    }

    public function test_output_never_carries_personal_values(): void
    {
        $needles = [];
        foreach (User::query()->withTrashed()->get() as $user) {
            $needles[] = $user->email;
            $needles[] = $user->fullName();
            $needles[] = (string) $user->last_name;
            $needles[] = (string) $user->phone;
            $needles[] = (string) $user->pesel;
            $needles[] = (string) $user->keycloak_sub;
        }
        foreach (DB::table('applications')->get(['email', 'last_name', 'phone']) as $application) {
            array_push($needles, $application->email, $application->last_name, (string) $application->phone);
        }
        $needles = array_values(array_filter(array_unique($needles), static fn (string $value): bool => strlen($value) >= 4));
        $this->assertNotEmpty($needles);

        [, $dry] = $this->runCommand(['--zachowaj' => $this->keepFile]);
        [, $real] = $this->runCommand(['--zachowaj' => $this->keepFile, '--wykonaj' => true, '--potwierdz' => '4']);

        foreach ([$dry, $real] as $output) {
            $this->assertStringNotContainsString('@', $output);
            foreach ($needles as $needle) {
                $this->assertStringNotContainsString($needle, $output);
            }
            $this->assertStringNotContainsString($this->keepFile, $output, 'sciezka pliku listy nie trafia na wyjscie');
        }

        $this->assertSame(1, DB::table('audit_log')->count(), 'jedyny wpis dziennika po biegu to wpis o czyszczeniu');
    }

    public function test_refuses_when_a_table_has_no_category(): void
    {
        Schema::create('tabela_bez_kategorii', function (Blueprint $table): void {
            $table->id();
        });
        $before = $this->snapshot();

        [$code, $output] = $this->runCommand(['--zachowaj' => $this->keepFile]);

        $this->assertSame(2, $code, $output);
        $this->assertStringContainsString('tabela_bez_kategorii', $output);
        $this->assertSame($before, $this->snapshot());
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array{0: int, 1: string}
     */
    private function runCommand(array $options): array
    {
        $code = Artisan::call('psychon:zero-danych-probnych', $options);

        return [$code, Artisan::output()];
    }

    /**
     * @return array<string, array{before: int, delete: int, after: int}>
     */
    private function parseTables(string $output, string $deleteLabel): array
    {
        preg_match_all('/^TABELA (\S+) przed=(\d+) '.$deleteLabel.'=(\d+) po=(\d+) /m', $output, $matches, PREG_SET_ORDER);
        $plan = [];
        foreach ($matches as [, $table, $before, $delete, $after]) {
            $plan[$table] = ['before' => (int) $before, 'delete' => (int) $delete, 'after' => (int) $after];
        }
        $this->assertArrayHasKey('users', $plan, $output);

        return $plan;
    }

    /**
     * Liczba wierszy kazdej tabeli oraz skrot wierszy kont (id, e-mail, rola,
     * stan, czas zmiany).
     *
     * @return array<string, int|string>
     */
    private function snapshot(): array
    {
        $tables = Schema::getTableListing(schemaQualified: false);
        sort($tables);
        $counts = [];
        foreach ($tables as $table) {
            $counts[$table] = DB::table($table)->count();
        }
        $counts['#users'] = md5(DB::table('users')->orderBy('id')->get(['id', 'email', 'role', 'status', 'updated_at', 'deleted_at'])->toJson());

        return $counts;
    }

    /**
     * @param  array<string, mixed>  $values
     * @return list<string>
     */
    private function sortedKeys(array $values): array
    {
        $keys = array_keys($values);
        sort($keys);

        return $keys;
    }

    private function writeRestoreResult(string $content): string
    {
        return $this->writeKeepFile($content);
    }

    private function writeKeepFile(string $content): string
    {
        $path = tempnam(sys_get_temp_dir(), 'zachowaj-probny-');
        $this->assertIsString($path);
        file_put_contents($path, $content);
        $this->ownFiles[] = $path;

        return $path;
    }

    /**
     * Pliki osob na dysku i slady spoza ziarna demo: eksport danych, skan
     * dyplomu, zalacznik profilu, wiadomosc pomocy, wpis dziennika audytu,
     * sesje SSO konta z listy i osoby probnej.
     */
    private function seedProbeTraces(User $admin): void
    {
        $disk = Storage::disk('local');
        $probe = User::query()->where('role', 'volunteer')->orderBy('id')->firstOrFail();

        foreach (DB::table('certificates')->pluck('pdf_path')->merge(DB::table('documents')->pluck('pdf_path'))->filter() as $path) {
            $disk->put($path, 'plik probny');
            $this->probeFiles[] = $path;
        }

        $exportPath = 'exports/ex_probny01.json';
        DB::table('data_exports')->insert([
            'public_id' => 'ex_probny01', 'user_id' => $probe->id, 'status' => 'ready',
            'file_path' => $exportPath, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $diplomaPath = 'diplomas/skan-probny.pdf';
        DB::table('applications')->update(['diploma_scan_path' => $diplomaPath]);

        $profileId = DB::table('psychologist_profiles')->value('id');
        $profilePath = "profile-documents/{$profileId}/dyplom-probny.pdf";
        DB::table('profile_documents')->insert([
            'profile_id' => $profileId, 'type' => 'dyplom', 'file_path' => $profilePath,
            'uploaded_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        foreach ([$exportPath, $diplomaPath, $profilePath] as $path) {
            $disk->put($path, 'plik probny');
            $this->probeFiles[] = $path;
        }

        DB::table('help_messages')->insert([
            'user_id' => $probe->id, 'role' => 'volunteer', 'screen' => '/panel',
            'content' => 'Wiadomosc probna.', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('access_date_changes')->insert([
            'user_id' => $probe->id, 'changed_by' => $admin->id, 'previous_expires_at' => now(),
            'new_expires_at' => now()->addMonth(), 'reason' => 'Powod probny.', 'created_at' => now(),
        ]);
        DB::table('audit_log')->insert([
            'actor_id' => $admin->id, 'action' => 'user.updated', 'subject_type' => User::class,
            'subject_id' => $probe->id, 'details' => null, 'created_at' => now(),
        ]);
        DB::table('sensitive_access_log')->insert([
            'viewer_id' => $admin->id, 'file_type' => 'diploma_scan', 'file_id' => 1,
            'viewed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('keycloak_sessions')->insert([
            ['sid' => 'sesja-konta-z-listy', 'sub' => $admin->keycloak_sub, 'created_at' => now()],
            ['sid' => 'sesja-osoby-probnej', 'sub' => (string) Str::uuid(), 'created_at' => now()],
        ]);
    }
}
