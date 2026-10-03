<?php

namespace Tests\Feature\H18;

use App\Models\TestAttemptReset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Migracja rekordów na powody wpisywane ręcznie: tylko dodaje kolumnę
 * `users.blocked_reason` i tabelę `test_attempt_resets`, a `down()` zdejmuje
 * wyłącznie te dwa obiekty — konta i ich pozostałe kolumny zostają.
 */
class BlockedReasonMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const string MIGRATION = 'database/migrations/2026_10_03_130000_add_blocked_reason_and_test_attempt_resets.php';

    public function test_rollback_removes_only_its_objects_and_migrate_restores_them(): void
    {
        $this->assertTrue(Schema::hasColumn('users', 'blocked_reason'));
        $this->assertTrue(Schema::hasTable('test_attempt_resets'));

        $person = User::factory()->create(['role' => 'volunteer', 'email' => 'migracja@demo.pl']);
        $columnsBefore = Schema::getColumnListing('users');

        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => self::MIGRATION])->run());

        $this->assertFalse(Schema::hasColumn('users', 'blocked_reason'));
        $this->assertFalse(Schema::hasTable('test_attempt_resets'));
        $this->assertSame(
            array_values(array_diff($columnsBefore, ['blocked_reason'])),
            Schema::getColumnListing('users'),
        );
        $this->assertSame('migracja@demo.pl', User::query()->findOrFail($person->id)->email);

        $this->assertSame(0, $this->artisan('migrate', ['--path' => self::MIGRATION])->run());

        $this->assertTrue(Schema::hasColumn('users', 'blocked_reason'));
        $this->assertTrue(Schema::hasTable('test_attempt_resets'));
        $this->assertSame($columnsBefore, Schema::getColumnListing('users'));
        $this->assertNull(User::query()->findOrFail($person->id)->blocked_reason);
    }

    public function test_the_reset_table_has_the_decided_columns(): void
    {
        $this->assertEqualsCanonicalizing(
            ['id', 'test_id', 'user_id', 'reset_by', 'reason', 'cleared', 'created_at'],
            Schema::getColumnListing('test_attempt_resets'),
        );
        $this->assertSame(0, TestAttemptReset::query()->count());
    }
}
