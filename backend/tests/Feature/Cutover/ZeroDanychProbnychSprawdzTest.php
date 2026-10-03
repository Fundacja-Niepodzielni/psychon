<?php

namespace Tests\Feature\Cutover;

use App\Models\Setting;
use App\Models\User;
use App\Support\ProductionStart;
use App\Support\RestoreTrial;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

/**
 * `php artisan psychon:zero-danych-probnych --sprawdz` na stanie ZBUDOWANYM RECZNIE
 * (baza po migracjach, bez ziarna): jedno konto personelu, jeden wpis `trial_data.purged`
 * w dzienniku, znacznik startu. Takiego stanu nie da sie uzyskac biegiem w tym samym tescie:
 * pod `RefreshDatabase` bieg otwiera przelacznik blokady dziennikow do konca testu (granica
 * opisana przy pomocniku blokady dziennikow w katalogu Support), a proba dziennikow musi trafic na blokade zamknieta.
 * Dlatego tu zaden test nie wola pomocnika blokady.
 *
 * Wzorzec zaliczony: konto personelu tak, uczestnikow nie ma, tabele sladow puste, w dzienniku
 * jeden wpis `trial_data.purged`, dziennik wgladu pusty, znacznik stoi, blokada dziennikow
 * odmawia usuniecia, zmiany i oproznienia, a dopisanie przechodzi.
 */
class ZeroDanychProbnychSprawdzTest extends TestCase
{
    use RefreshDatabase;

    private const string PASSED_PROBE = 'PROBA_DZIENNIKA usuniecie=odmowa zmiana=odmowa oproznienie=odmowa dopisanie=dziala';

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->staff = User::factory()->create(['role' => 'super_admin']);
        DB::table('audit_log')->insert(['actor_id' => null, 'action' => 'trial_data.purged', 'created_at' => now()]);
        RestoreTrial::record();
        ProductionStart::record(now());
    }

    public function test_the_reference_state_passes_and_the_check_leaves_no_trace(): void
    {
        $before = $this->counts();

        [$code, $output] = $this->check();

        $this->assertSame(0, $code, $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK start_produkcji=zapisany$/m', $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK odtworzenie_probne=zapisany$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ uczestnicy=0$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ slady_osob=0$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_audytu wierszy=1 pierwszy=trial_data\.purged$/m', $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_wgladu wierszy=0$/m', $output);
        $this->assertStringContainsString(self::PASSED_PROBE, $output);
        $this->assertMatchesRegularExpression('/^WYNIK SPRAWDZ ZALICZONE$/m', $output);

        $this->assertSame($before, $this->counts(), 'proba dziennikow jest wycofana: w dziennikach nie zostaje nic');
        $this->assertSame(1, DB::table('audit_log')->count());
        $this->assertSame(0, DB::table('sensitive_access_log')->count());
    }

    public function test_the_check_works_after_the_marker_and_needs_no_list(): void
    {
        [$code, $output] = $this->check();

        $this->assertSame(0, $code, $output);
        $this->assertTrue(ProductionStart::isRecorded());
    }

    public function test_a_participant_account_fails_the_check(): void
    {
        User::factory()->create(['role' => 'volunteer']);

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ uczestnicy=1$/m', $output);
        $this->assertMatchesRegularExpression('/^WYNIK SPRAWDZ NIEZALICZONE$/m', $output);
    }

    public function test_a_trace_row_fails_the_check_and_names_the_table(): void
    {
        DB::table('notifications')->insert([
            'user_id' => $this->staff->id, 'type' => 'export.ready', 'title' => 'x', 'body' => 'y',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ slady_osob=1 tabele=notifications$/m', $output);
    }

    public function test_a_second_journal_entry_fails_the_check(): void
    {
        DB::table('audit_log')->insert(['actor_id' => null, 'action' => 'user.updated', 'created_at' => now()]);

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_audytu wierszy=2 pierwszy=trial_data\.purged$/m', $output);
    }

    public function test_an_access_log_row_fails_the_check(): void
    {
        DB::table('sensitive_access_log')->insert([
            'viewer_id' => $this->staff->id, 'file_type' => 'diploma_scan', 'file_id' => 1,
            'viewed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^SPRAWDZ dziennik_wgladu wierszy=1$/m', $output);
    }

    public function test_a_missing_marker_fails_the_check(): void
    {
        DB::table('settings')->where('key', ProductionStart::KEY)->delete();

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK start_produkcji=brak$/m', $output);
    }

    public function test_a_missing_restore_trial_marker_fails_the_check(): void
    {
        DB::table('settings')->where('key', RestoreTrial::KEY)->delete();

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^ZNACZNIK odtworzenie_probne=brak$/m', $output);
        $this->assertMatchesRegularExpression('/^WYNIK SPRAWDZ NIEZALICZONE$/m', $output);
    }

    public function test_a_journal_without_the_lock_fails_the_check(): void
    {
        // DDL w PostgreSQL jest transakcyjne: zdjecie wyzwalacza znika razem z wycofaniem testu.
        DB::unprepared('DROP TRIGGER audit_log_lock ON audit_log');
        $before = $this->counts();

        [$code, $output] = $this->check();

        $this->assertSame(3, $code, $output);
        $this->assertMatchesRegularExpression('/^PROBA_DZIENNIKA usuniecie=dziala zmiana=dziala oproznienie=dziala dopisanie=dziala$/m', $output);
        $this->assertMatchesRegularExpression('/^WYNIK SPRAWDZ NIEZALICZONE$/m', $output);
        $this->assertSame($before, $this->counts(), 'proba na niezablokowanym dzienniku tez jest wycofana');
    }

    public function test_the_markers_cannot_be_written_or_removed_through_the_settings_model(): void
    {
        foreach ([ProductionStart::KEY, RestoreTrial::KEY] as $key) {
            foreach ([
                fn () => Setting::query()->create(['key' => $key, 'value' => 'x']),
                fn () => Setting::query()->updateOrCreate(['key' => $key], ['value' => 'x']),
                fn () => Setting::query()->where('key', $key)->firstOrFail()->update(['value' => 'x']),
                fn () => Setting::query()->where('key', $key)->firstOrFail()->delete(),
            ] as $attempt) {
                try {
                    $attempt();
                    $this->fail("Model Setting przepuscil zapis znacznika {$key}.");
                } catch (LogicException) {
                    $this->assertTrue(DB::table('settings')->where('key', $key)->exists());
                }
            }
        }

        // Zwykly klucz przechodzi.
        Setting::query()->create(['key' => 'inny_klucz', 'value' => 'x'])->delete();
        $this->assertTrue(ProductionStart::isRecorded());
        $this->assertTrue(RestoreTrial::isRecorded());
    }

    public function test_the_marker_is_written_once(): void
    {
        $this->expectException(LogicException::class);

        ProductionStart::record(now());
    }

    /**
     * @return array{0: int, 1: string}
     */
    private function check(): array
    {
        $code = Artisan::call('psychon:zero-danych-probnych', ['--sprawdz' => true]);

        return [$code, Artisan::output()];
    }

    /**
     * @return array<string, int>
     */
    private function counts(): array
    {
        return [
            'audit_log' => DB::table('audit_log')->count(),
            'sensitive_access_log' => DB::table('sensitive_access_log')->count(),
            'users' => DB::table('users')->count(),
            'settings' => DB::table('settings')->count(),
        ];
    }
}
