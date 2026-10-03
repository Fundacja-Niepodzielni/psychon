<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use Closure;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H18 · sprawdzenie „ostatniego aktywnego administratora” powtórzone na
 * wierszach zablokowanych w transakcji — blokada, odebranie roli i anonimizacja.
 *
 * Sprawdzenie w `authorize()` czyta pulę bez blokady, więc samo nie wystarczy:
 * między nim a zapisem druga operacja może zatwierdzić zmianę. Dwa świadkowie
 * z DRUGIM połączeniem bazy (bez procesów potomnych, więc działa też na Windows):
 *
 *  1. powtórka — drugie połączenie trzyma niezatwierdzoną zmianę innego
 *     administratora i zatwierdza ją dokładnie w chwili, gdy żądanie sięga po
 *     pierwszą blokadę wierszy; sprawdzenie sprzed blokady jeszcze jej nie
 *     widziało, powtórka pod blokadą już tak;
 *  2. blokada — drugie połączenie trzyma wiersz innego administratora, a żądanie
 *     z krótkim limitem oczekiwania na blokadę musi na nim utknąć (błąd bazy
 *     „lock not available"), czyli pula jest naprawdę blokowana.
 *
 * Klasa zapisuje na trwałe (drugie połączenie nie widzi transakcji testu),
 * dlatego bez `RefreshDatabase` i ze sprzątaniem stanu w `tearDown`.
 */
class AdministratorPoolRowLockTest extends TestCase
{
    use ActsWithRealmToken;
    use DatabaseMigrations;

    private const string WITNESS = 'administrator_pool_witness';

    private ?ConnectionInterface $witness = null;

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);
    }

    protected function tearDown(): void
    {
        // Drugie połączenie musi oddać blokady przed opróżnieniem tabel.
        if ($this->witness !== null && $this->witness->transactionLevel() > 0) {
            $this->witness->rollBack();
        }
        DB::purge(self::WITNESS);
        DB::statement('set lock_timeout = 0');

        $this->przywrocStanZastanejBazy();

        parent::tearDown();
    }

    private function witness(): ConnectionInterface
    {
        config(['database.connections.'.self::WITNESS => config('database.connections.'.DB::getDefaultConnection())]);

        return $this->witness = DB::connection(self::WITNESS);
    }

    /**
     * Osoba wywołująca z rolą Super Admina w tokenie (bez lokalnej roli administracyjnej)
     * oraz dwa powiązane aktywne konta Opiekuna Projektu.
     *
     * @return array{0: User, 1: User, 2: User}
     */
    private function actorAndTwoAdministrators(): array
    {
        return [
            $this->boundAccount('volunteer'),
            $this->boundAccount('project_manager'),
            $this->boundAccount('project_manager'),
        ];
    }

    /** Wykonuje `$action` tuż przed pierwszym zapytaniem z blokadą wierszy (`for update`) na połączeniu żądania. */
    private function beforeFirstRowLock(Closure $action): void
    {
        $done = false;

        DB::beforeExecuting(function (string $query) use (&$done, $action): void {
            if ($done || ! str_contains(strtolower($query), 'for update')) {
                return;
            }

            $done = true;
            $action();
        });
    }

    private function journalRows(): int
    {
        return AuditLogEntry::query()->whereIn('action', ['user.blocked', 'user.updated', 'user.anonymized'])->count();
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>}>
     */
    public static function operations(): array
    {
        return [
            'blokada' => ['POST', 'block', ['reason' => 'Powód']],
            'odebranie roli' => ['PATCH', '', ['role' => 'volunteer']],
            'anonimizacja' => ['POST', 'anonymize', []],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function operate(User $actor, User $target, string $method, string $suffix, array $body)
    {
        $url = "/api/v1/admin/users/{$target->id}".($suffix === '' ? '' : "/{$suffix}");

        return $this->withTokenOf($actor, 'super_admin')->json($method, $url, $body);
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('operations')]
    public function test_the_check_is_repeated_under_the_row_lock(string $method, string $suffix, array $body): void
    {
        [$actor, $target, $other] = $this->actorAndTwoAdministrators();

        // Drugie połączenie blokuje drugiego administratora, ale jeszcze tego nie zatwierdziło:
        // sprawdzenie sprzed blokady widzi dwóch aktywnych administratorów.
        $witness = $this->witness();
        $witness->beginTransaction();
        $witness->table('users')->where('id', $other->id)->update(['status' => 'blocked']);

        // Zatwierdzenie tuż przed pierwszą blokadą wierszy w żądaniu.
        $this->beforeFirstRowLock(fn () => $witness->commit());

        $this->operate($actor, $target, $method, $suffix, $body)
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'last_active_administrator')
            ->assertJsonPath('error.message', 'To ostatnie aktywne konto administracji. Najpierw nadaj tę rolę innej osobie.');

        $this->assertSame(0, $witness->transactionLevel());
        $fresh = $target->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertSame('project_manager', $fresh->role);
        $this->assertNull($fresh->anonymized_at);
        $this->assertSame('blocked', $other->fresh()->status);
        $this->assertSame(0, $this->journalRows());
    }

    public function test_the_super_admin_check_is_repeated_under_the_row_lock(): void
    {
        $actor = $this->boundAccount('volunteer');
        $target = $this->boundAccount('super_admin');
        $other = $this->boundAccount('super_admin');
        $this->boundAccount('project_manager');

        // Drugi Super Admin traci rolę w drugim połączeniu; pula administracji zostaje
        // dwuosobowa, więc odmowę może dać wyłącznie reguła ostatniego Super Admina.
        $witness = $this->witness();
        $witness->beginTransaction();
        $witness->table('users')->where('id', $other->id)->update(['role' => 'project_manager']);

        $this->beforeFirstRowLock(fn () => $witness->commit());

        $this->operate($actor, $target, 'PATCH', '', ['role' => 'volunteer'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'last_active_administrator');

        $this->assertSame('super_admin', $target->fresh()->role);
        $this->assertSame('project_manager', $other->fresh()->role);
        $this->assertSame(0, $this->journalRows());
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('operations')]
    public function test_the_administrator_rows_are_locked_before_the_write(string $method, string $suffix, array $body): void
    {
        [$actor, $target, $other] = $this->actorAndTwoAdministrators();

        // Drugie połączenie trzyma wiersz drugiego administratora; zwykły odczyt
        // (sprawdzenie sprzed blokady) go nie czeka, blokada wierszy — tak.
        $witness = $this->witness();
        $witness->beginTransaction();
        $witness->select('select id from users where id = ? for update', [$other->id]);

        DB::statement("set lock_timeout = '300ms'");
        $this->withoutExceptionHandling();

        try {
            $this->operate($actor, $target, $method, $suffix, $body);
        } catch (QueryException $exception) {
            $this->assertStringContainsString('55P03', $exception->getMessage());
            $this->assertSame('active', $target->fresh()->status);
            $this->assertSame('project_manager', $target->fresh()->role);
            $this->assertNull($target->fresh()->anonymized_at);
            $this->assertSame(0, $this->journalRows());

            return;
        }

        $this->fail('Żądanie nie czekało na wiersz drugiego administratora — pula nie jest blokowana przed zapisem.');
    }
}
