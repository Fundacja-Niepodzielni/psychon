<?php

namespace Tests\Feature\AuditLock;

use App\Models\AuditLogEntry;
use App\Models\SensitiveAccessLogEntry;
use App\Models\User;
use App\Services\H18\UserAnonymizer;
use App\Support\AuditLog;
use App\Support\AuditTablesLock;
use Closure;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use RuntimeException;
use Tests\TestCase;

/**
 * Świadkowie blokady dzienników (`audit_log`, `sensitive_access_log`) na PostgreSQL.
 *
 * Każda odmowa jest mierzona treścią błędu z bazy, nie samym faktem wyjątku:
 * odmowa wyzwalacza niesie „audit tables lock", odmowa klucza obcego — nazwę klucza.
 *
 * Operacje, które mają się nie udać, biegną w zagnieżdżonej transakcji (punkt
 * zapisu), żeby błąd nie unieważnił transakcji testu. Granice PRAWDZIWEJ
 * transakcji (przełącznik znika po zatwierdzeniu) mierzy osobne połączenie —
 * transakcja testu nie da się zatwierdzić w połowie.
 *
 * `php artisan test --filter=AuditTablesLockTest`
 */
class AuditTablesLockTest extends TestCase
{
    use RefreshDatabase;

    private const string MIGRATION = 'database/migrations/2026_10_01_140000_lock_audit_tables.php';

    private const string SECOND_CONNECTION = 'audit_lock_witness';

    private const array TABLES = ['audit_log', 'sensitive_access_log'];

    protected function tearDown(): void
    {
        DB::purge(self::SECOND_CONNECTION);

        parent::tearDown();
    }

    public function test_insert_passes_on_both_tables(): void
    {
        $this->journalRows(User::factory()->create());

        $this->assertSame(1, DB::table('audit_log')->count());
        $this->assertSame(1, DB::table('sensitive_access_log')->count());
    }

    public function test_update_is_refused_on_both_tables(): void
    {
        $this->journalRows(User::factory()->create());
        $before = $this->journalSnapshot();

        $this->assertRefusedByLock(fn () => DB::table('audit_log')->update(['action' => 'user.blocked']), 'UPDATE on audit_log');
        $this->assertRefusedByLock(fn () => AuditLogEntry::query()->firstOrFail()->forceFill(['details' => ['x' => 1]])->save(), 'UPDATE on audit_log');
        $this->assertRefusedByLock(fn () => DB::table('sensitive_access_log')->update(['file_id' => 999]), 'UPDATE on sensitive_access_log');
        // Także polecenie, które nie objęłoby żadnego wiersza.
        $this->assertRefusedByLock(fn () => DB::table('audit_log')->where('id', -1)->update(['action' => 'x']), 'UPDATE on audit_log');

        $this->assertSame($before, $this->journalSnapshot());
    }

    public function test_delete_is_refused_on_both_tables_without_the_switch(): void
    {
        $this->journalRows(User::factory()->create());
        $before = $this->journalSnapshot();

        $this->assertRefusedByLock(fn () => DB::table('audit_log')->delete(), 'DELETE on audit_log');
        $this->assertRefusedByLock(fn () => AuditLogEntry::query()->firstOrFail()->delete(), 'DELETE on audit_log');
        $this->assertRefusedByLock(fn () => DB::table('sensitive_access_log')->delete(), 'DELETE on sensitive_access_log');
        $this->assertRefusedByLock(fn () => SensitiveAccessLogEntry::query()->firstOrFail()->delete(), 'DELETE on sensitive_access_log');

        $this->assertSame($before, $this->journalSnapshot());
    }

    public function test_truncate_is_refused_on_both_tables_without_the_switch(): void
    {
        $this->journalRows(User::factory()->create());
        $before = $this->journalSnapshot();

        $this->assertRefusedByLock(fn () => DB::statement('truncate table audit_log'), 'TRUNCATE on audit_log');
        $this->assertRefusedByLock(fn () => DB::statement('truncate table sensitive_access_log'), 'TRUNCATE on sensitive_access_log');
        // Opróżnienie kont kaskadą obejmuje oba dzienniki — też odmowa.
        $this->assertRefusedByLock(fn () => DB::statement('truncate table users restart identity cascade'), 'TRUNCATE on');

        $this->assertSame($before, $this->journalSnapshot());
    }

    public function test_switch_opens_delete_and_truncate_but_never_update(): void
    {
        $this->journalRows(User::factory()->create());
        $this->journalRows(User::factory()->create());

        AuditTablesLock::allowPurgeInCurrentTransaction();

        $this->assertRefusedByLock(fn () => DB::table('audit_log')->update(['action' => 'user.blocked']), 'UPDATE on audit_log');
        $this->assertRefusedByLock(fn () => DB::table('sensitive_access_log')->update(['file_id' => 999]), 'UPDATE on sensitive_access_log');
        $this->assertSame(2, DB::table('audit_log')->where('action', 'user.updated')->count());

        $this->assertSame(1, DB::table('audit_log')->where('id', DB::table('audit_log')->min('id'))->delete());
        $this->assertSame(1, DB::table('sensitive_access_log')->where('id', DB::table('sensitive_access_log')->min('id'))->delete());
        $this->assertSame(1, DB::table('audit_log')->count());
        $this->assertSame(1, DB::table('sensitive_access_log')->count());

        DB::statement('truncate table audit_log, sensitive_access_log');
        $this->assertSame(0, DB::table('audit_log')->count());
        $this->assertSame(0, DB::table('sensitive_access_log')->count());

        // Dopisanie działa dalej.
        $this->journalRows(User::factory()->create());
        $this->assertSame(1, DB::table('audit_log')->count());
    }

    public function test_interrupted_purge_leaves_the_journal_as_it_was_and_the_lock_closed(): void
    {
        $this->journalRows(User::factory()->create());
        $this->journalRows(User::factory()->create());
        $before = $this->journalSnapshot();

        try {
            DB::transaction(function (): void {
                AuditTablesLock::allowPurgeInCurrentTransaction();

                $this->assertSame(2, DB::table('audit_log')->delete());
                $this->assertSame(2, DB::table('sensitive_access_log')->delete());

                throw new RuntimeException('czyszczenie przerwane w połowie');
            });
            $this->fail('Transakcja czyszczenia miała zostać przerwana.');
        } catch (RuntimeException $exception) {
            $this->assertSame('czyszczenie przerwane w połowie', $exception->getMessage());
        }

        // Wiersze wróciły, a blokada zamknęła się razem z wycofaną transakcją.
        $this->assertSame($before, $this->journalSnapshot());
        $this->assertRefusedByLock(fn () => DB::table('audit_log')->delete(), 'DELETE on audit_log');
        $this->assertRefusedByLock(fn () => DB::statement('truncate table sensitive_access_log'), 'TRUNCATE on sensitive_access_log');
    }

    public function test_switch_cannot_be_set_outside_a_transaction(): void
    {
        $second = $this->secondConnection();
        $this->assertSame(0, $second->transactionLevel());

        $this->expectException(LogicException::class);

        AuditTablesLock::allowPurgeInCurrentTransaction($second);
    }

    public function test_switch_does_not_outlive_its_transaction(): void
    {
        $second = $this->secondConnection();

        // W transakcji z przełącznikiem usunięcie przechodzi (połączenie nie widzi
        // niezatwierdzonych wierszy testu, więc niczego faktycznie nie usuwa).
        $second->beginTransaction();
        AuditTablesLock::allowPurgeInCurrentTransaction($second);
        $this->assertSame(0, $second->table('audit_log')->delete());
        $this->assertSame(0, $second->table('sensitive_access_log')->delete());
        $second->commit();

        // Po zatwierdzeniu to samo połączenie znów dostaje odmowę.
        $this->assertRefusedOn($second, fn () => $second->table('audit_log')->delete(), 'DELETE on audit_log');
        $this->assertRefusedOn($second, fn () => $second->table('sensitive_access_log')->delete(), 'DELETE on sensitive_access_log');

        // To samo po wycofaniu.
        $second->beginTransaction();
        AuditTablesLock::allowPurgeInCurrentTransaction($second);
        $second->rollBack();
        $this->assertRefusedOn($second, fn () => $second->table('audit_log')->delete(), 'DELETE on audit_log');
    }

    public function test_session_level_value_of_the_switch_opens_nothing(): void
    {
        $second = $this->secondConnection();

        // Wartość „na oko" ustawiona na całą sesję.
        $second->select('select set_config(?, ?, false)', [AuditTablesLock::SWITCH, 'on']);
        $this->assertRefusedOn($second, fn () => $second->table('audit_log')->delete(), 'DELETE on audit_log');

        // Identyfikator transakcji zapisany na całą sesję: ważny w tej jednej
        // transakcji, w każdej następnej już nie.
        $second->beginTransaction();
        $second->select('select set_config(?, pg_current_xact_id()::text, false)', [AuditTablesLock::SWITCH]);
        $second->commit();
        $this->assertRefusedOn($second, fn () => $second->table('audit_log')->delete(), 'DELETE on audit_log');
        $this->assertRefusedOn($second, fn () => $second->statement('truncate table sensitive_access_log'), 'TRUNCATE on sensitive_access_log');
    }

    public function test_hard_delete_of_an_account_with_a_journal_row_is_refused_by_the_database(): void
    {
        $actor = User::factory()->create();
        AuditLog::record($actor, 'user.updated', $actor);

        $viewer = User::factory()->create();
        SensitiveAccessLogEntry::create(['viewer_id' => $viewer->id, 'file_type' => 'diploma_scan', 'file_id' => 1, 'viewed_at' => now()]);

        $before = $this->journalSnapshot();

        $this->assertRefused(fn () => DB::table('users')->where('id', $actor->id)->delete(), 'audit_log_actor_id_foreign');
        $this->assertRefused(fn () => $actor->forceDelete(), 'audit_log_actor_id_foreign');
        $this->assertRefused(fn () => DB::table('users')->where('id', $viewer->id)->delete(), 'sensitive_access_log_viewer_id_foreign');

        // Przełącznik otwiera dzienniki, nie klucz: konto z wierszem dziennika dalej nie da się usunąć.
        AuditTablesLock::allowPurgeInCurrentTransaction();
        $this->assertRefused(fn () => DB::table('users')->where('id', $actor->id)->delete(), 'audit_log_actor_id_foreign');

        $this->assertSame($before, $this->journalSnapshot());
        $this->assertSame(2, DB::table('users')->whereIn('id', [$actor->id, $viewer->id])->count());

        // Konto bez wiersza dziennika usuwa się jak dotąd.
        $plain = User::factory()->create();
        $this->assertSame(1, DB::table('users')->where('id', $plain->id)->delete());
    }

    public function test_anonymisation_passes_and_leaves_the_journal_untouched(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $target = User::factory()->create();
        $this->journalRows($target);
        AuditLog::record($admin, 'user.blocked', $target);

        $before = $this->journalSnapshot();

        UserAnonymizer::run($target->fresh(), $admin);

        $after = $this->journalSnapshot();

        // Wiersze sprzed anonimizacji są bajt w bajt te same; doszedł jeden nowy.
        $this->assertSame($before['sensitive_access_log'], $after['sensitive_access_log']);
        $this->assertSame($before['audit_log'], array_slice($after['audit_log'], 0, count($before['audit_log'])));
        $this->assertCount(count($before['audit_log']) + 1, $after['audit_log']);
        $this->assertSame('user.anonymized', $after['audit_log'][count($before['audit_log'])]['action']);
        $this->assertNotNull(DB::table('users')->where('id', $target->id)->value('id'), 'anonimizacja nie usuwa wiersza konta');
    }

    public function test_migration_passes_on_existing_journal_rows_and_up_down_up_restores_the_same_catalog_state(): void
    {
        $this->journalRows(User::factory()->create());
        $locked = $this->catalogState();

        $this->assertSame(['audit_log_lock', 'sensitive_access_log_lock'], array_column($locked['triggers'], 'tgname'));
        $this->assertSame(
            ['audit_log_actor_id_foreign' => 'r', 'sensitive_access_log_viewer_id_foreign' => 'r'],
            array_column($locked['foreign_keys'], 'confdeltype', 'conname'),
        );
        $this->assertCount(1, $locked['functions']);

        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => self::MIGRATION])->run());

        // Stan sprzed migracji: bez wyzwalaczy i funkcji, klucze jak dawniej.
        $unlocked = $this->catalogState();
        $this->assertSame([], $unlocked['triggers']);
        $this->assertSame([], $unlocked['functions']);
        $this->assertSame(
            ['audit_log_actor_id_foreign' => 'n', 'sensitive_access_log_viewer_id_foreign' => 'c'],
            array_column($unlocked['foreign_keys'], 'confdeltype', 'conname'),
        );

        // Baza z ISTNIEJĄCYMI wierszami obu dzienników — dokładamy jeszcze po jednym.
        $this->journalRows(User::factory()->create());
        $rows = $this->journalSnapshot();
        $this->assertCount(2, $rows['audit_log']);
        $this->assertCount(2, $rows['sensitive_access_log']);

        $this->assertSame(0, $this->artisan('migrate', ['--path' => self::MIGRATION])->run());

        $this->assertSame($rows, $this->journalSnapshot(), 'migracja zmieniła wiersze dziennika');
        $this->assertSame($locked, $this->catalogState(), 'po up -> down -> up stan wyzwalaczy i kluczy jest inny niż na początku');
        $this->assertRefusedByLock(fn () => DB::table('audit_log')->delete(), 'DELETE on audit_log');
    }

    /** Po jednym wierszu w każdym dzienniku, z kontem jako sprawcą i oglądającym. */
    private function journalRows(User $user): void
    {
        AuditLog::record($user, 'user.updated', $user);
        SensitiveAccessLogEntry::create([
            'viewer_id' => $user->id,
            'file_type' => 'diploma_scan',
            'file_id' => 1,
            'viewed_at' => now(),
        ]);
    }

    /** @return array<string, list<array<string, mixed>>> */
    private function journalSnapshot(): array
    {
        $snapshot = [];

        foreach (self::TABLES as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get()
                ->map(static fn (object $row): array => (array) $row)
                ->all();
        }

        return $snapshot;
    }

    /**
     * Stan wyzwalaczy, kluczy obcych i funkcji odczytany z katalogu bazy.
     *
     * @return array{triggers: list<array<string, mixed>>, foreign_keys: list<array<string, mixed>>, functions: list<array<string, mixed>>}
     */
    private function catalogState(): array
    {
        $rows = static fn (array $result): array => array_map(static fn (object $row): array => (array) $row, $result);

        return [
            'triggers' => $rows(DB::select(
                "select tgname, tgrelid::regclass::text as table_name, tgtype, tgenabled, pg_get_triggerdef(oid) as definition
                 from pg_trigger
                 where not tgisinternal and tgrelid in ('audit_log'::regclass, 'sensitive_access_log'::regclass)
                 order by tgname"
            )),
            'foreign_keys' => $rows(DB::select(
                "select conname, confdeltype, confupdtype, pg_get_constraintdef(oid) as definition
                 from pg_constraint
                 where contype = 'f' and conrelid in ('audit_log'::regclass, 'sensitive_access_log'::regclass)
                 order by conname"
            )),
            'functions' => $rows(DB::select(
                "select proname, md5(prosrc) as body_md5 from pg_proc where proname = 'audit_tables_lock_guard'"
            )),
        ];
    }

    private function secondConnection(): ConnectionInterface
    {
        config(['database.connections.'.self::SECOND_CONNECTION => config('database.connections.'.DB::getDefaultConnection())]);

        return DB::connection(self::SECOND_CONNECTION);
    }

    private function assertRefusedByLock(Closure $operation, string $what): void
    {
        $this->assertRefused($operation, 'audit tables lock: '.$what);
    }

    /** Operacja w punkcie zapisu transakcji testu ma skończyć się błędem bazy o podanej treści. */
    private function assertRefused(Closure $operation, string $expectedFragment): void
    {
        try {
            DB::transaction($operation);
        } catch (QueryException $exception) {
            $this->assertStringContainsString($expectedFragment, $exception->getMessage());

            return;
        }

        $this->fail('Baza przyjęła operację, którą miała odrzucić: '.$expectedFragment);
    }

    /** To samo na osobnym połączeniu, poza transakcją testu. */
    private function assertRefusedOn(ConnectionInterface $connection, Closure $operation, string $what): void
    {
        try {
            $operation();
        } catch (QueryException $exception) {
            $this->assertStringContainsString('audit tables lock: '.$what, $exception->getMessage());

            return;
        }

        $this->fail('Baza przyjęła operację, którą miała odrzucić: '.$what);
    }
}
