<?php

namespace Tests\Feature\AccessExpiry;

use App\Models\AccessDateChange;
use App\Models\AuditLogEntry;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H04 · rekord zmian daty dostępu z obowiązkowym powodem.
 *
 * `POST /admin/users/{id}/extend-access` wymaga `reason`; data w `users` i
 * wiersz `access_date_changes` powstają razem, a powód nie trafia do ładunku
 * zdarzenia `access.extended` — treść wpisana ręcznie żyje w rekordzie
 * dziedzinowym, skąd anonimizacja konta może ją usunąć.
 *
 * `php artisan test --filter=AccessDateChangeRecordTest`
 */
class AccessDateChangeRecordTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_10_02_223000_create_access_date_changes_table.php';

    private const REASON = 'Powód-znacznik-4711: przedłużenie po rozmowie z osobą.';

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function invalidReasons(): array
    {
        return [
            'brak pola' => [[]],
            'pusty napis' => [['reason' => '']],
            'null' => [['reason' => null]],
            'same spacje' => [['reason' => '     ']],
            'spacje i tabulator' => [['reason' => " \t \n "]],
            '1001 znaków' => [['reason' => str_repeat('a', 1001)]],
            '1001 znaków wielobajtowych' => [['reason' => str_repeat('ż', 1001)]],
            'tablica zamiast tekstu' => [['reason' => ['x']]],
        ];
    }

    /**
     * @param  array<string, mixed>  $reasonField
     */
    #[DataProvider('invalidReasons')]
    public function test_missing_or_invalid_reason_is_rejected_and_nothing_is_written(array $reasonField): void
    {
        $this->actingAsRole('project_manager');
        $expiry = now()->addMonth()->startOfSecond();
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => $expiry]);

        foreach ([['months' => 2], ['until' => now()->addMonths(5)->toDateString()]] as $when) {
            $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", $when + $reasonField)
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonStructure(['error' => ['errors' => ['reason']]]);
        }

        $this->assertEquals($expiry->timestamp, $volunteer->fresh()->access_expires_at->timestamp, 'data dostępu zmieniona mimo odmowy');
        $this->assertSame(0, AccessDateChange::query()->count(), 'rekord zmian zapisany mimo odmowy');
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->count(), 'audyt zapisany mimo odmowy');
    }

    public function test_reason_messages_are_polish(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $url = "/api/v1/admin/users/{$volunteer->id}/extend-access";

        $this->postJson($url, ['months' => 1])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.reason.0', 'Podaj powód zmiany daty dostępu.');

        $this->postJson($url, ['months' => 1, 'reason' => str_repeat('a', 1001)])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.reason.0', 'Powód jest za długi (maksymalnie 1000 znaków).');

        $this->postJson($url, ['months' => 1, 'reason' => ['x']])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.reason.0', 'Powód musi być tekstem.');
    }

    public function test_reason_of_exactly_one_thousand_characters_is_accepted(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'months' => 1,
            'reason' => str_repeat('ż', 1000),
        ])->assertOk();

        $this->assertSame(str_repeat('ż', 1000), AccessDateChange::query()->firstOrFail()->reason);
    }

    public function test_valid_request_writes_the_date_and_one_record_with_the_previous_date(): void
    {
        $admin = $this->actingAsRole('project_manager');
        $previous = now()->addMonth()->startOfSecond();
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => $previous]);

        $response = $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'months' => 3,
            'reason' => '  '.self::REASON.'  ',
        ])->assertOk();

        $volunteer->refresh();
        $response->assertJsonPath('data.access_expires_at', $volunteer->access_expires_at->toIso8601ZuluString());

        $this->assertSame(1, AccessDateChange::query()->count());
        $change = AccessDateChange::query()->firstOrFail();
        $this->assertSame($volunteer->id, $change->user_id);
        $this->assertSame($admin->id, $change->changed_by);
        $this->assertSame($previous->timestamp, $change->previous_expires_at?->timestamp);
        $this->assertSame($volunteer->access_expires_at->timestamp, $change->new_expires_at->timestamp);
        $this->assertSame(self::REASON, $change->reason, 'powód zapisany z białymi znakami na brzegach');
        $this->assertNotNull($change->created_at);
    }

    public function test_first_ever_date_has_no_previous_value_in_the_record(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => null]);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'months' => 1,
            'reason' => self::REASON,
        ])->assertOk();

        $this->assertNull(AccessDateChange::query()->firstOrFail()->previous_expires_at);
    }

    public function test_audit_payload_carries_dates_only_never_the_reason(): void
    {
        $admin = $this->actingAsRole('project_manager');
        $previous = now()->addMonth()->startOfSecond();
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => $previous]);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'until' => now()->addMonths(4)->toDateString(),
            'reason' => self::REASON,
        ])->assertOk();

        $entry = AuditLogEntry::query()->where('action', 'access.extended')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($volunteer->id, $entry->subject_id);

        $details = $entry->details;
        $this->assertIsArray($details);
        $this->assertArrayNotHasKey('reason', $details);
        $this->assertSame(
            ['access_expires_at', 'previous_access_expires_at'],
            collect(array_keys($details))->sort()->values()->all(),
            'ładunek ma inne klucze niż daty: '.json_encode(array_keys($details)),
        );
        $this->assertStringNotContainsString('4711', (string) json_encode($details, JSON_UNESCAPED_UNICODE));
        $this->assertStringNotContainsString('przedłużenie po rozmowie', (string) json_encode($details, JSON_UNESCAPED_UNICODE));
        $this->assertStringNotContainsString('4711', (string) json_encode($entry->toArray(), JSON_UNESCAPED_UNICODE));
        $this->assertSame($previous->toIso8601ZuluString(), $details['previous_access_expires_at']);
    }

    public function test_months_and_until_both_work_with_a_reason(): void
    {
        $this->actingAsRole('super_admin');
        $stacking = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => now()->addMonth()]);
        $base = $stacking->access_expires_at->copy();
        $direct = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => null]);
        $until = now()->addMonths(3)->startOfDay();

        $this->postJson("/api/v1/admin/users/{$stacking->id}/extend-access", ['months' => 1, 'reason' => self::REASON])->assertOk();
        $this->postJson("/api/v1/admin/users/{$direct->id}/extend-access", ['until' => $until->toDateString(), 'reason' => self::REASON])->assertOk();

        $this->assertEqualsWithDelta($base->copy()->addMonth()->timestamp, $stacking->fresh()->access_expires_at->timestamp, 5);
        $this->assertSame($until->toDateString(), $direct->fresh()->access_expires_at->toDateString());
        $this->assertSame(2, AccessDateChange::query()->count());
        $this->assertSame(
            $direct->fresh()->access_expires_at->timestamp,
            AccessDateChange::query()->where('user_id', $direct->id)->firstOrFail()->new_expires_at->timestamp,
        );
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    public static function untilBoundaries(): array
    {
        return [
            'zwykły dzień' => ['2026-10-02 10:00:00', '2028-10-02', '2028-10-03'],
            'tuż przed polską północą' => ['2026-10-02 21:59:59', '2028-10-02', '2028-10-03'],
            'po polskiej północy, jeszcze przed północą UTC' => ['2026-10-02 23:59:59', '2028-10-03', '2028-10-04'],
            'rok przestępny, 29 lutego' => ['2028-02-29 12:00:00', '2030-02-28', '2030-03-01'],
            'koniec roku' => ['2026-12-31 12:00:00', '2028-12-31', '2029-01-01'],
        ];
    }

    #[DataProvider('untilBoundaries')]
    public function test_until_is_at_most_twenty_four_months_from_today(string $today, string $lastAllowed, string $firstRefused): void
    {
        $this->actingAsRole('project_manager');
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => null]);
        $this->travelTo(Carbon::parse($today));
        $url = "/api/v1/admin/users/{$volunteer->id}/extend-access";

        // Dzień po granicy: odmowa na `errors.until`, nic nie zapisane.
        $this->postJson($url, ['until' => $firstRefused, 'reason' => self::REASON])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.until.0', 'Nowa data dostępu może być najwyżej 24 miesiące od dziś.');

        $this->assertNull($volunteer->fresh()->access_expires_at, 'data zmieniona mimo odmowy');
        $this->assertSame(0, AccessDateChange::query()->count(), 'rekord zapisany mimo odmowy');
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->count(), 'audyt zapisany mimo odmowy');

        // Dokładnie dziś + 24 miesiące przechodzi.
        $this->postJson($url, ['until' => $lastAllowed, 'reason' => self::REASON])->assertOk();

        $this->assertSame($lastAllowed, $volunteer->fresh()->access_expires_at->toDateString());
        $this->assertSame(1, AccessDateChange::query()->count());
    }

    public function test_a_date_far_beyond_the_limit_is_refused_on_until_not_on_other_fields(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'until' => '2099-01-01',
            'reason' => self::REASON,
        ])->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['until']]])
            ->assertJsonMissingPath('error.errors.reason');

        $this->assertSame(0, AccessDateChange::query()->count());
    }

    public function test_months_and_until_together_are_still_rejected_without_a_record(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'months' => 3,
            'until' => now()->addMonth()->toDateString(),
            'reason' => self::REASON,
        ])->assertStatus(422);

        $this->assertSame(0, AccessDateChange::query()->count());
    }

    public function test_failure_inside_the_transaction_leaves_neither_date_nor_record(): void
    {
        $this->actingAsRole('super_admin');
        $expiry = now()->addMonth()->startOfSecond();
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => $expiry]);

        // Audyt jest ostatnim krokiem transakcji: gdy zapis do dziennika padnie,
        // nie może zostać ani nowa data, ani wiersz rekordu.
        AuditLogEntry::creating(static function (): never {
            throw new \RuntimeException('audit refused');
        });

        $this->withoutExceptionHandling();

        try {
            $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
                'months' => 2,
                'reason' => self::REASON,
            ]);
            $this->fail('zapis do dziennika powinien był przerwać transakcję');
        } catch (\RuntimeException $e) {
            $this->assertSame('audit refused', $e->getMessage());
        }

        $this->assertSame($expiry->timestamp, $volunteer->fresh()->access_expires_at->timestamp, 'data zmieniona mimo wycofanej transakcji');
        $this->assertSame(0, AccessDateChange::query()->count(), 'rekord zapisany mimo wycofanej transakcji');
    }

    public function test_roles_without_access_get_403_and_leave_no_record(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAsRole($role);

            $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1, 'reason' => self::REASON])
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }

        $this->assertSame(0, AccessDateChange::query()->count());
    }

    public function test_guest_gets_401_and_leaves_no_record(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1, 'reason' => self::REASON])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertSame(0, AccessDateChange::query()->count());
    }

    public function test_unknown_person_gets_404_and_leaves_no_record(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/v1/admin/users/999999/extend-access', ['months' => 1, 'reason' => self::REASON])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame(0, AccessDateChange::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->count());
    }

    public function test_migration_rolls_back_only_its_table_and_migrates_clean_again(): void
    {
        $this->assertTrue(Schema::hasTable('access_date_changes'));
        $usersBefore = User::factory()->count(2)->create()->count();
        $this->assertGreaterThan(0, $usersBefore);
        $tablesBefore = collect(Schema::getTableListing())->reject(fn (string $t): bool => str_ends_with($t, 'access_date_changes'))->sort()->values()->all();

        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => self::MIGRATION])->run());

        $this->assertFalse(Schema::hasTable('access_date_changes'));
        $tablesAfter = collect(Schema::getTableListing())->sort()->values()->all();
        $this->assertSame($tablesBefore, $tablesAfter, 'down() ruszył inne tabele niż swoją');
        $this->assertTrue(Schema::hasColumn('users', 'access_expires_at'));

        $this->assertSame(0, $this->artisan('migrate', ['--path' => self::MIGRATION])->run());

        $this->assertTrue(Schema::hasTable('access_date_changes'));
        $this->assertEqualsCanonicalizing(
            ['id', 'user_id', 'changed_by', 'previous_expires_at', 'new_expires_at', 'reason', 'created_at'],
            Schema::getColumnListing('access_date_changes'),
        );

        $indexed = collect(Schema::getIndexes('access_date_changes'))->contains(
            fn (array $index): bool => $index['columns'] === ['user_id'] && ! $index['primary'],
        );
        $this->assertTrue($indexed, 'brak indeksu po user_id');

        $nullable = collect(Schema::getColumns('access_date_changes'))->pluck('nullable', 'name');
        $this->assertTrue($nullable['previous_expires_at']);
        $this->assertTrue($nullable['changed_by']);
        $this->assertFalse($nullable['new_expires_at']);
        $this->assertFalse($nullable['reason']);
    }

    public function test_deleting_the_acting_admin_keeps_the_record_with_a_null_author(): void
    {
        $actor = User::factory()->create(['role' => 'project_manager']);
        $subject = User::factory()->create(['role' => 'volunteer']);
        $change = AccessDateChange::query()->create([
            'user_id' => $subject->id,
            'changed_by' => $actor->id,
            'previous_expires_at' => null,
            'new_expires_at' => now()->addMonth(),
            'reason' => self::REASON,
        ]);

        DB::table('users')->where('id', $actor->id)->delete();

        $this->assertNull($change->fresh()->changed_by);
        $this->assertSame($subject->id, $change->fresh()->user_id);
    }

    public function test_anonymization_clears_the_reason_but_keeps_the_facts_of_the_change(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => now()->addMonth()]);
        $bystander = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => now()->addMonth()]);

        foreach ([$volunteer, $bystander] as $person) {
            $this->postJson("/api/v1/admin/users/{$person->id}/extend-access", ['months' => 2, 'reason' => self::REASON])->assertOk();
        }
        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1, 'reason' => 'Drugi powód: Jan Kowalski prosił telefonicznie.'])->assertOk();

        $before = AccessDateChange::query()->where('user_id', $volunteer->id)->orderBy('id')->get();
        $this->assertCount(2, $before);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/anonymize")->assertStatus(200);

        $after = AccessDateChange::query()->where('user_id', $volunteer->id)->orderBy('id')->get();
        $this->assertSame($before->pluck('id')->all(), $after->pluck('id')->all(), 'wiersze rekordu zniknęły');
        foreach ($after as $i => $row) {
            $this->assertSame('', $row->reason, 'powód przeżył anonimizację');
            $this->assertSame($admin->id, $row->changed_by);
            $this->assertSame($before[$i]->new_expires_at->timestamp, $row->new_expires_at->timestamp);
            $this->assertSame($before[$i]->previous_expires_at?->timestamp, $row->previous_expires_at?->timestamp);
        }

        $this->assertSame(
            self::REASON,
            AccessDateChange::query()->where('user_id', $bystander->id)->firstOrFail()->reason,
            'anonimizacja jednej osoby ruszyła powód innej',
        );
    }

    public function test_second_anonymization_attempt_closes_a_reason_left_behind(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/anonymize")->assertStatus(200);

        // Stan zastany: konto już zanonimizowane, a powód został (np. sprzed tej zmiany).
        AccessDateChange::query()->create([
            'user_id' => $volunteer->id,
            'changed_by' => null,
            'previous_expires_at' => null,
            'new_expires_at' => now()->addMonth(),
            'reason' => self::REASON,
        ]);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/anonymize")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'already_anonymized');

        $this->assertSame('', AccessDateChange::query()->where('user_id', $volunteer->id)->firstOrFail()->reason);
    }
}
